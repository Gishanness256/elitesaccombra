CREATE TABLE IF NOT EXISTS regulatory_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator VARCHAR(150) NOT NULL,
  input_key VARCHAR(120) NOT NULL,
  input_value NUMERIC(18, 6) NOT NULL,
  unit VARCHAR(40),
  effective_from DATE NOT NULL,
  effective_to DATE,
  source_reference VARCHAR(500),
  notes TEXT,
  entered_by UUID NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (regulator, input_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_regulatory_inputs_key_effective
  ON regulatory_inputs (regulator, input_key, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_regulatory_inputs_effective_dates
  ON regulatory_inputs (effective_from, effective_to);