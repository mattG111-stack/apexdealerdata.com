from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # The only variable you must set. Railway's Postgres plugin injects it.
    database_url: str = ""
    # Generated if unset so a deploy boots. Set it in production: it also
    # encrypts the stored Claude/CarJam keys, and a generated one changes on
    # every restart, which logs everyone out and makes saved keys unreadable.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "changeme"
    cors_origins: str = "http://localhost:3000"
    batch_retention_limit: int = 12  # keep last N batches per type+region
    brave_api_key: str = ""          # optional — reliable search for external estimates
    stripe_secret_key: str = ""      # optional — Stripe billing metrics on the admin dashboard

    # --- self-serve onboarding + trial billing ---------------------------------
    app_base_url: str = "http://localhost:3000"   # where Stripe redirects back after checkout
    trial_days: int = 7                            # free-trial length; first charge after this
    # Stripe subscription price the trial converts to. Create a recurring Price in
    # Stripe and put its id here; without it, checkout can't start.
    stripe_price_id: str = ""
    stripe_webhook_secret: str = ""                # verifies Stripe webhook signatures
    # Email delivery (Resend). Without a key we log the code to the server instead
    # of sending — the flow still works end-to-end in dev.
    resend_api_key: str = ""
    email_from: str = "Apex <onboarding@resend.dev>"
    # SMS delivery (Twilio) — not wired yet; phone codes are logged for now.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    verify_code_ttl_minutes: int = 15              # how long an email/phone code stays valid

    @property
    def cors_origin_list(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]


settings = Settings()

if not settings.jwt_secret:
    import secrets as _secrets
    settings.jwt_secret = _secrets.token_urlsafe(48)
    print(
        "WARNING: JWT_SECRET is not set — generated a temporary one. Sessions and "
        "saved API keys will not survive a restart. Set JWT_SECRET in your "
        "environment.",
        flush=True,
    )

if not settings.database_url:
    raise SystemExit(
        "\nDATABASE_URL is not set.\n\n"
        "On Railway: add the Postgres plugin to this project — it injects\n"
        "DATABASE_URL automatically. Locally: copy .env.example to .env and\n"
        "fill it in.\n"
    )
