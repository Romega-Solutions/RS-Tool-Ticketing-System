-- Admin-action audit trail + API rate-limit counters (Phase 1).
create table if not exists audit_log (
  id             serial primary key,
  actor_id       integer not null,
  action         text not null,
  target_user_id integer,
  details        jsonb,
  created_at     text not null default CURRENT_TIMESTAMP
);
create index if not exists audit_log_created_idx on audit_log (created_at);
create index if not exists audit_log_actor_idx   on audit_log (actor_id);

create table if not exists rate_limits (
  key          text not null,
  window_start text not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
