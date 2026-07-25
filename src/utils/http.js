export function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*"
    }
  });
}

export function failure(error) {
  console.error(error);
  return json({
    error: "The live public-source scan is temporarily unavailable.",
    detail: String(error?.message || error),
    generatedAt: new Date().toISOString(),
    events: [],
    companies: []
  }, 502, 30);
}
