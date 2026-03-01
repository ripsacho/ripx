-- Login OTP codes for accepted users: 6-digit code, 1 min expiry, rate limit 3 per 15 min per email

CREATE TABLE IF NOT EXISTS login_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otp_codes_email ON login_otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_login_otp_codes_expires ON login_otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_otp_codes_email_created ON login_otp_codes(email, created_at);

COMMENT ON TABLE login_otp_codes IS '6-digit OTP for accepted users; 1 min expiry; rate limit 3 sends per 15 min per email';
