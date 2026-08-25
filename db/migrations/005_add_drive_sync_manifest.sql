BEGIN;

CREATE TABLE IF NOT EXISTS public.drive_sync_manifest (
    drive_file_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    drive_path TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    modified_time TIMESTAMPTZ NOT NULL,
    md5_checksum TEXT,
    chunks_count INTEGER NOT NULL DEFAULT 0 CHECK (chunks_count >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_sync_manifest_status
    ON public.drive_sync_manifest (status);

CREATE INDEX IF NOT EXISTS idx_drive_sync_manifest_modified_time
    ON public.drive_sync_manifest (modified_time DESC);

ALTER TABLE public.drive_sync_manifest ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.drive_sync_manifest FROM anon, authenticated;
GRANT ALL ON TABLE public.drive_sync_manifest TO service_role;

COMMIT;
