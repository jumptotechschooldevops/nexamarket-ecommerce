CREATE TYPE product_status AS ENUM ('active', 'inactive', 'archived');

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES sellers (id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    image_url TEXT NOT NULL,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    brand VARCHAR(100),
    rating NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    status product_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_products_seller_id ON products (seller_id);
CREATE INDEX idx_products_status ON products (status);
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
