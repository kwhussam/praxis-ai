import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { domain } = await req.json();

  if (!domain) {
    return Response.json({ error: "domain is required" }, { status: 400 });
  }

  return Response.json({
    domain,
    checkedAt: new Date().toISOString(),
    scoreImpact: -9,
    findings: [
      {
        id: "dmarc-policy",
        severity: "warning",
        title: "DMARC policy is missing or too weak"
      }
    ]
  });
});
