import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * The deployed host, so Server Actions are not rejected behind the
       * proxy that terminates TLS in front of the app.
       *
       * Next compares the request's Origin against its Host, and a proxy that
       * rewrites Host (or forwards it as x-forwarded-host) makes the two
       * disagree — at which point the action is refused before it runs. From
       * the browser that looks like a button that does nothing, which is
       * exactly what the import upload was reported as doing.
       *
       * Localhost is always allowed and does not need listing.
       */
      allowedOrigins: ["ffprocess-rfhlth.cranl.net"],

      /**
       * A filled-in workbook is an ordinary Server Action payload and has to
       * fit under this. The default is 1 MB, which a large process with
       * several hundred rows can exceed; the importer itself refuses anything
       * over 4 MB, so this sits just above that and lets the importer's own
       * message do the refusing rather than the framework's.
       */
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
