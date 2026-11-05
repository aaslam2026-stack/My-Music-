// sunoapi.org requires a callBackUrl. The app polls for status instead,
// so this endpoint simply acknowledges callbacks with HTTP 200.
export default async () => new Response(JSON.stringify({ code: 200, msg: "ok" }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});
