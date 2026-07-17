var ownerResponse = http.request(
  SUPABASE_URL + "/rest/v1/practices?id=eq." + PRACTICE_ID,
  {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      owner_id: OWNER_ID
    })
  }
);

output.ownerChange = {
  status: ownerResponse.status,
  body: ownerResponse.body
};
