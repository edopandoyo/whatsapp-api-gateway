ALTER TABLE ai_configs
  ADD COLUMN provider     text NOT NULL DEFAULT 'ollama'
                          CHECK (provider IN ('ollama', 'groq', 'auto')),
  ADD COLUMN groq_api_key text DEFAULT NULL;

COMMENT ON COLUMN ai_configs.provider     IS 'ollama | groq | auto (groq dulu, fallback ollama)';
COMMENT ON COLUMN ai_configs.groq_api_key IS 'API Key dari console.groq.com';