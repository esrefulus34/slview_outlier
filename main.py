#!/usr/bin/env python3
"""
SLView Outlier — Local HTTP Server & IOC Proxy
Serves static assets and provides a proxy route to acquire data from IOC Sea Level Monitoring
without any browser CORS restrictions.

Usage:
    python3 main.py [PORT]
    (Default port: 8080)
"""

import os
import sys
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class SLViewRequestHandler(SimpleHTTPRequestHandler):
    """Request handler providing static asset serving and IOC data acquisition proxy."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local cross-origin usage if needed
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # -------------------------------------------------------------
        # Route: /api/data or /api/ioc-proxy
        # Acquires 24h/period data from IOC Sea Level Monitoring facility
        # -------------------------------------------------------------
        if parsed.path in ("/api/data", "/api/ioc-proxy", "/data"):
            query_params = urllib.parse.parse_qs(parsed.query)

            code = query_params.get("code", ["erdek"])[0].strip()
            period = query_params.get("period", ["1"])[0].strip()
            endtime = query_params.get("endtime", [""])[0].strip()

            # Construct IOC target URL
            ioc_url = (
                f"https://www.ioc-sealevelmonitoring.org/bgraph.php?"
                f"code={urllib.parse.quote(code)}&output=tab&period={urllib.parse.quote(period)}"
            )
            if endtime:
                ioc_url += f"&endtime={urllib.parse.quote(endtime)}"

            try:
                req = urllib.request.Request(
                    ioc_url,
                    headers={
                        "User-Agent": (
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        ),
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    },
                )

                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw_content = resp.read()

                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("X-Proxy-Target", ioc_url)
                self.end_headers()
                self.wfile.write(raw_content)

            except Exception as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                error_json = (
                    f'{{"error": "Failed to fetch from IOC server", "details": "{str(exc)}", '
                    f'"target_url": "{ioc_url}"}}'
                )
                self.wfile.write(error_json.encode("utf-8"))
            return

        # -------------------------------------------------------------
        # Route: Static Files & Root Index (index.html, css, js, etc.)
        # -------------------------------------------------------------
        if parsed.path == "/" or parsed.path == "":
            self.path = "/index.html"

        super().do_GET()


def run_server(port=DEFAULT_PORT):
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, SLViewRequestHandler)
    print("=" * 64)
    print(f"🌊 SLView Outlier Server running at http://localhost:{port}/")
    print(f"📁 Serving static files from: {BASE_DIR}")
    print(f"🔌 IOC Data Proxy available at: http://localhost:{port}/api/data?code=erdek&period=1")
    print("   Press Ctrl+C to stop the server.")
    print("=" * 64)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user.")
        httpd.server_close()


if __name__ == "__main__":
    port_arg = DEFAULT_PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port_arg = int(sys.argv[1])
    run_server(port_arg)

