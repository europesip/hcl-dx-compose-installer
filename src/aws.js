// AWS options: sizes, approximate prices and the time each one takes to create.
// Prices: on-demand, Linux, eu-west-1 (Ireland), USD, November 2026, without taxes or data transfer.
// They are an orientation only: the real amount is the one AWS charges (calculator.aws).

export const REGIONS = ["eu-west-1", "eu-west-3", "eu-central-1", "eu-south-2", "eu-north-1", "us-east-1", "us-east-2", "us-west-2"];

export const EC2_TYPES = {      // vCPU, GiB, USD/hour in eu-west-1
  "m6i.2xlarge": [8, 32, 0.428], "m6i.4xlarge": [16, 64, 0.856], "m7i.4xlarge": [16, 64, 0.8988], "r6i.2xlarge": [8, 64, 0.564], "m6a.4xlarge": [16, 64, 0.7704],
};
const GP3 = 0.088 / 730;        // per GB-hour
const IPV4 = 0.005;             // per public IPv4 address and hour
const EKS = 0.10, NAT = 0.048, NLB = 0.0252, ROSA_HCP = 0.25, ROSA_VCPU = 0.171 / 4;

export const AWS_KINDS = {
  ec2: {defaults: {instanceType: "m6i.4xlarge", diskGb: 200}, minutes: 10, tested: true},
  eks: {defaults: {instanceType: "m6i.2xlarge", nodes: 2}, minutes: 25, tested: true},
  rosa: {defaults: {instanceType: "m6i.2xlarge", nodes: 2}, minutes: 45, tested: false},
};

export function estimate(kind, p = {}){
  const t = EC2_TYPES[p.instanceType] || EC2_TYPES[AWS_KINDS[kind].defaults.instanceType];
  let hour = 0; const lines = [];
  const add = (label, v) => { hour += v; lines.push([label, v]); };
  if (kind === "ec2") {
    add(`EC2 ${p.instanceType || "m6i.4xlarge"}`, t[2]);
    add(`EBS gp3 ${p.diskGb || 200} GB`, (p.diskGb || 200) * GP3);
    add("Public IPv4", IPV4);
  } else if (kind === "eks") {
    const n = Number(p.nodes || 2);
    add("EKS control plane", EKS);
    add(`EC2 ${n} × ${p.instanceType || "m6i.2xlarge"}`, n * t[2]);
    add("NAT gateway", NAT + IPV4);
    add("Network Load Balancer", NLB + 3 * IPV4);
    add("EBS gp3 (nodes + volumes)", (n * 100 + 60) * GP3);
  } else {
    const n = Number(p.nodes || 2);
    add("ROSA HCP cluster fee", ROSA_HCP);
    add(`ROSA worker fee ${n} × ${t[0]} vCPU`, n * t[0] * ROSA_VCPU);
    add(`EC2 ${n} × ${p.instanceType || "m6i.2xlarge"}`, n * t[2]);
    add("NAT gateway, load balancers", NAT + NLB * 2 + 4 * IPV4);
    add("EBS gp3", (n * 300 + 60) * GP3);
  }
  return {hour, day: hour * 24, month: hour * 730, lines};
}
export const money = (v, lang) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0}).format(v);

// The page talks to the installer server (server/index.mjs)
export async function api(path, opts = {}){
  const r = await fetch(path, {headers: {"Content-Type": "application/json"}, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
