CREATE TABLE sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    store_name VARCHAR(150) NOT NULL,
    store_slug VARCHAR(160) NOT NULL,
    store_description TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sellers_user_id_unique UNIQUE (user_id),
    CONSTRAINT sellers_store_slug_unique UNIQUE (store_slug)
);

CREATE INDEX idx_sellers_user_id ON sellers (user_id);
