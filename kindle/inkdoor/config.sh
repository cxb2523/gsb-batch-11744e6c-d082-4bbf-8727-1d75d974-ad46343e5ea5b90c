# ===== EDIT HERE =====
# Address of the image served by "inkdoor serve" (use your computer's IP on the local network)
URL="http://192.168.0.10:3667/kindle.png"

# Longest wait between screen updates, in seconds. The server asks for an earlier one when the
# door is about to change (a meeting starts or ends), so this rarely needs to be shorter.
INTERVAL=300

# Every N updates, do a full refresh (the screen flashes once and clears ghosting)
FULL_REFRESH_EVERY=6

# Language of the messages shown on the Kindle: en-US or pt-BR
LANGUAGE="en-US"
