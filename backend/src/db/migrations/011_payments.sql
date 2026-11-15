CREATE TYPE payment_method AS ENUM ('simulated_card', 'simulated_paypal', 'simulated_wallet');
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    method payment_method NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    transaction_ref VARCHAR(64) NOT NULL,
    card_last4 VARCHAR(4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payments_order_id_unique UNIQUE (order_id),
    CONSTRAINT payments_transaction_ref_unique UNIQUE (transaction_ref)
);

CREATE INDEX idx_payments_order_id ON payments (order_id);
