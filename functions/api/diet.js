export async function onRequestGet({ request, env }) {
  // Serve the JSON dataset from static assets via the Pages ASSETS binding
  const url = new URL('/data/diet_data.json', request.url);
  const res = await env.ASSETS.fetch(url.toString());
  if (!res.ok) {
    return new Response('Not found', { status: 404 });
  }
  const json = await res.json();
  return Response.json(json);
}
