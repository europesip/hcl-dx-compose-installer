// Demo LDAP users with the real EUROPESIP data (name, surname and e-mail), on purpose: whoever installs a demo can see
// who to contact. The engine keeps its neutral users (andres@dxdemo.com...) because the golden test compares it with
// the frozen labs wizard; this output layer rewrites the generated LDIF. uid, title, preferredLanguage, passwords and
// groups do not change, so every guide and step that signs in as "andres" or "macarena" still works.
export const PEOPLE = {
  andres:   {givenName: "Andrés",   sn: "Gorostidi",        mail: "andres@europesip.com"},
  eduardo:  {givenName: "Eduardo",  sn: "Barranca",         mail: "eduardo.barranca@europesip.com"},
  macarena: {givenName: "Macarena", sn: "Cortés",           mail: "macarena.cortes@europesip.com"},
  enrique:  {givenName: "Enrique",  sn: "Gil",              mail: "enrique.gil@europesip.com"},
  jordi:    {givenName: "Jordi",    sn: "Urrea",            mail: "jordi.urrea@europesip.com"},
  patricia: {givenName: "Patricia", sn: "Zapata",           mail: "patricia.zapata@europesip.com"},
  german:   {givenName: "Germán",   sn: "Valcarce",         mail: "german.valcarce@europesip.com"},
  justo:    {givenName: "Justo",    sn: "Jimenez",          mail: "justo.jimenez@europesip.com"},
};

// LDIF (RFC 2849): a value that is not plain ASCII goes base64-encoded, "attr:: <base64>"
const b64 = v => btoa(String.fromCharCode(...new TextEncoder().encode(v)));
const attr = (k, v) => /^[\x20-\x7e]*$/.test(v) && !/^[ :<]/.test(v) ? `${k}: ${v}` : `${k}:: ${b64(v)}`;

export function peopleLdif(text){
  if (typeof text !== "string") return text;
  return text.split(/\n(?=dn: )/).map(block => {
    const uid = (block.match(/^dn: uid=([^,]+),ou=users,/) || [])[1], p = uid && PEOPLE[uid];
    if (!p) return block;
    const v = {cn: `${p.givenName} ${p.sn}`, givenName: p.givenName, sn: p.sn, mail: p.mail};
    return block.replace(/^(cn|givenName|sn|mail)::? .*$/gm, (m, k) => attr(k, v[k]));
  }).join("\n");
}
