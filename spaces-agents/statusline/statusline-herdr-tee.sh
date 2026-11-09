#!/bin/sh
payload=$(cat)
out_dir="$HOME/.claude/herdr-usage"
next_file="$out_dir/next-statusline"
if [ -n "$payload" ] && command -v jq >/dev/null 2>&1; then
  mkdir -p "$out_dir/sessions" 2>/dev/null
  case "$payload" in
    *'"rate_limits"'*)
      tmp="$out_dir/.latest.$$"
      printf '%s' "$payload" | jq -c '{updated_at: now, session_id, rate_limits}' > "$tmp" 2>/dev/null && mv -f "$tmp" "$out_dir/latest.json" || rm -f "$tmp"
      ;;
  esac
  sid=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)
  case "$sid" in
    ''|*[!A-Za-z0-9-]*) ;;
    *)
      tmp="$out_dir/sessions/.$sid.$$"
      printf '%s' "$payload" | jq -c '{updated_at: now, session_id, context_window, model: .model.display_name}' > "$tmp" 2>/dev/null && mv -f "$tmp" "$out_dir/sessions/$sid.json" || rm -f "$tmp"
      ;;
  esac
fi
if [ -s "$next_file" ]; then
  printf '%s' "$payload" | /bin/sh -c "$(cat "$next_file")"
fi
