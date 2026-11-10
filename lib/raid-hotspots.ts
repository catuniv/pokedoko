import type { LiveRaid } from "./live-raid-types";

export type RaidHotspot = {
  id: string;
  cityId: string;
  lat: number;
  lon: number;
  gymName: string;
  raidIds: string[];
  count: number;
  /** Historical community recommendation, not a current attendance measurement. */
  communitySpot?: { name: string; sourceUrl: string; coordinateSource?: string };
};

export type CommunityRaidSpot = {
  id: string;
  cityId: string;
  name: string;
  lat: number;
  lon: number;
  sourceUrl: string;
  coordinateSource?: string;
};

type Position = { lat: number; lon: number };
type Vector = [number, number, number];
type Point = Position & {
  id: string;
  cityId: string;
  gymName: string;
  vector: Vector;
  used: boolean;
  leaf: TreeNode | null;
};
type TreeNode = {
  min: Vector;
  max: Vector;
  count: number;
  usedCount: number;
  parent: TreeNode | null;
  left: TreeNode | null;
  right: TreeNode | null;
  points: Point[] | null;
};

const EARTH_RADIUS_KM = 6371.0088;
const HALF_CIRCUMFERENCE_KM = Math.PI * EARTH_RADIUS_KM;
const RAD = Math.PI / 180;
const LEAF_SIZE = 16;
// A micrometre-scale allowance only prevents floating-point roundoff from
// excluding a point that is exactly on the requested circle boundary.
const BOUNDARY_EPSILON_KM = 1e-9;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const validPosition = (value: Position) =>
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lon) &&
  value.lat >= -90 &&
  value.lat <= 90 &&
  value.lon >= -180 &&
  value.lon <= 180;

/** Great-circle distance on a mean-radius Earth, in kilometres. */
export function distanceKm(a: Position, b: Position): number {
  if (!validPosition(a) || !validPosition(b)) {
    throw new RangeError("위도·경도가 유효하지 않습니다.");
  }
  const latitude = (b.lat - a.lat) * RAD;
  const longitude = (((b.lon - a.lon + 540) % 360) - 180) * RAD;
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a.lat * RAD) *
      Math.cos(b.lat * RAD) *
      Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function vectorFor(position: Position): Vector {
  const latitude = position.lat * RAD;
  const longitude = (position.lon === 180 ? -180 : position.lon) * RAD;
  const scale = Math.cos(latitude);
  return [scale * Math.cos(longitude), scale * Math.sin(longitude), Math.sin(latitude)];
}

function squaredDistance(a: Vector, b: Vector): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function buildTree(points: Point[], parent: TreeNode | null = null): TreeNode {
  const min: Vector = [Infinity, Infinity, Infinity];
  const max: Vector = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point.vector[axis]);
      max[axis] = Math.max(max[axis], point.vector[axis]);
    }
  }
  const node: TreeNode = { min, max, count: points.length, usedCount: 0, parent, left: null, right: null, points: null };
  let axis = 0;
  if (max[1] - min[1] > max[axis] - min[axis]) axis = 1;
  if (max[2] - min[2] > max[axis] - min[axis]) axis = 2;
  if (points.length <= LEAF_SIZE || max[axis] === min[axis]) {
    node.points = points;
    for (const point of points) point.leaf = node;
  } else {
    points.sort((a, b) => a.vector[axis] - b.vector[axis] || compareText(a.id, b.id));
    const middle = Math.floor(points.length / 2);
    node.left = buildTree(points.slice(0, middle), node);
    node.right = buildTree(points.slice(middle), node);
  }
  return node;
}

/** Sphere/cuboid bounds: outside nodes are skipped; contained nodes are counted at once. */
function relation(node: TreeNode, center: Vector, radiusSquared: number): -1 | 0 | 1 {
  let nearest = 0;
  let farthest = 0;
  for (let axis = 0; axis < 3; axis++) {
    const coordinate = center[axis];
    const gap = coordinate < node.min[axis] ? node.min[axis] - coordinate : coordinate > node.max[axis] ? coordinate - node.max[axis] : 0;
    nearest += gap * gap;
    const outer = Math.max(Math.abs(coordinate - node.min[axis]), Math.abs(coordinate - node.max[axis]));
    farthest += outer * outer;
  }
  return nearest > radiusSquared ? -1 : farthest <= radiusSquared ? 1 : 0;
}

function countWithin(node: TreeNode, center: Vector, radiusSquared: number): number {
  const location = relation(node, center, radiusSquared);
  if (location === -1) return 0;
  if (location === 1) return node.count;
  if (node.points) {
    let count = 0;
    for (const point of node.points) if (squaredDistance(point.vector, center) <= radiusSquared) count++;
    return count;
  }
  return countWithin(node.left!, center, radiusSquared) + countWithin(node.right!, center, radiusSquared);
}

function hasUsedWithin(node: TreeNode, center: Vector, radiusSquared: number): boolean {
  if (!node.usedCount) return false;
  const location = relation(node, center, radiusSquared);
  if (location === -1) return false;
  if (location === 1) return true;
  if (node.points) return node.points.some((point) => point.used && squaredDistance(point.vector, center) <= radiusSquared);
  return hasUsedWithin(node.left!, center, radiusSquared) || hasUsedWithin(node.right!, center, radiusSquared);
}

function collectAll(node: TreeNode, output: Point[]) {
  if (node.points) for (const point of node.points) output.push(point);
  else { collectAll(node.left!, output); collectAll(node.right!, output); }
}

function collectWithin(node: TreeNode, center: Vector, radiusSquared: number, output: Point[]) {
  const location = relation(node, center, radiusSquared);
  if (location === -1) return;
  if (location === 1) { collectAll(node, output); return; }
  if (node.points) {
    for (const point of node.points) if (squaredDistance(point.vector, center) <= radiusSquared) output.push(point);
  } else {
    collectWithin(node.left!, center, radiusSquared, output);
    collectWithin(node.right!, center, radiusSquared, output);
  }
}

function markUsed(point: Point) {
  if (point.used) return;
  point.used = true;
  for (let node = point.leaf; node; node = node.parent) node.usedCount++;
}

function groupRaidPoints(raids: readonly LiveRaid[]): Map<string, Point[]> {
  const valid = raids.filter((raid) => raid && typeof raid.id === "string" && raid.id.length > 0 && typeof raid.cityId === "string" && raid.cityId.length > 0 && typeof raid.gymName === "string" && validPosition(raid));
  // Canonical order makes conflicting duplicates independent of input order.
  const canonical = [...valid].sort((a, b) => compareText(a.id, b.id) || compareText(a.cityId, b.cityId) || a.lat - b.lat || a.lon - b.lon || compareText(a.gymName, b.gymName));
  const seen = new Set<string>();
  const groups = new Map<string, Point[]>();
  for (const raid of canonical) {
    if (seen.has(raid.id)) continue;
    seen.add(raid.id);
    const point: Point = { id: raid.id, cityId: raid.cityId, lat: raid.lat, lon: raid.lon, gymName: raid.gymName, vector: vectorFor(raid), used: false, leaf: null };
    const group = groups.get(point.cityId) ?? [];
    group.push(point);
    groups.set(point.cityId, group);
  }
  return groups;
}

type Candidate = { point: Point; count: number; communitySpot?: RaidHotspot["communitySpot"] };

function selectCandidates(candidates: Candidate[], trees: Map<string, TreeNode>, radiusSquared: number, coversGlobe: boolean, limit: number): RaidHotspot[] {
  candidates.sort((a, b) => b.count - a.count || compareText(a.point.cityId, b.point.cityId) || compareText(a.point.id, b.point.id));
  const hotspots: RaidHotspot[] = [];
  for (const candidate of candidates) {
    if (candidate.count < 1) continue;
    const point = candidate.point;
    const tree = trees.get(point.cityId)!;
    if (point.used || tree.usedCount === tree.count || (coversGlobe ? tree.usedCount > 0 : hasUsedWithin(tree, point.vector, radiusSquared))) continue;
    const members: Point[] = [];
    if (coversGlobe) collectAll(tree, members);
    else collectWithin(tree, point.vector, radiusSquared, members);
    for (const member of members) markUsed(member);
    const raidIds = members.map((member) => member.id).sort(compareText);
    hotspots.push({
      id: point.id, cityId: point.cityId, lat: point.lat, lon: point.lon, gymName: point.gymName, raidIds, count: raidIds.length,
      ...(candidate.communitySpot ? { communitySpot: { ...candidate.communitySpot } } : {}),
    });
    if (hotspots.length >= limit) break;
  }
  return hotspots;
}

function validArguments(radiusKm: number, limit: number) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) throw new RangeError("반경은 0보다 큰 유한한 km 값이어야 합니다.");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("표시 개수는 0 이상의 정수여야 합니다.");
}

function radiusSquaredFor(radiusKm: number): number {
  const chord = 2 * Math.sin(Math.min(radiusKm + BOUNDARY_EPSILON_KM, HALF_CIRCUMFERENCE_KM) / (2 * EARTH_RADIUS_KM));
  return chord * chord;
}

/**
 * Compare radius counts centred at each supplied gym coordinate, within each city.
 * This is a ranking of the supplied data, not a worldwide density estimate.
 * Time/expiry filtering belongs to the caller. Duplicate IDs count once. Circles
 * sharing any raid ID with an earlier selection are omitted, rather than being
 * re-counted after removing that raid. The input is never mutated.
 *
 * A balanced 3D sphere index avoids longitude/date-line special cases and the
 * all-pairs haversine scan. Range queries aggregate fully contained tree nodes;
 * selected circles maintain used counts on the same index to reject overlaps
 * without repeatedly enumerating an already-selected dense neighbourhood.
 */
export function findRaidHotspots(raids: readonly LiveRaid[], radiusKm: number, limit = 5): RaidHotspot[] {
  validArguments(radiusKm, limit);
  if (!raids.length || limit === 0) return [];
  const groups = groupRaidPoints(raids);
  const trees = new Map<string, TreeNode>();
  const candidates: Candidate[] = [];
  const coversGlobe = radiusKm >= HALF_CIRCUMFERENCE_KM;
  const radiusSquared = radiusSquaredFor(radiusKm);
  for (const [cityId, points] of groups) {
    const tree = buildTree(points);
    trees.set(cityId, tree);
    for (const point of points) candidates.push({ point, count: coversGlobe ? tree.count : countWithin(tree, point.vector, radiusSquared) });
  }
  return selectCandidates(candidates, trees, radiusSquared, coversGlobe, limit);
}

function httpsSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

/**
 * Rank community-recommended place coordinates by real raid counts around them.
 * These places are candidate centres only: they are never inserted into the raid
 * index or counted as gyms. Zero-count places produce no result, and this mode
 * never silently falls back to gym-centred density rankings. Attendance is not
 * inferred from either recommendation history or the number of raids.
 */
export function findRecommendedRaidHotspots(raids: readonly LiveRaid[], radiusKm: number, spots: readonly CommunityRaidSpot[], limit = 5): RaidHotspot[] {
  validArguments(radiusKm, limit);
  if (spots.length > 2000) throw new RangeError("추천 장소는 최대 2000개까지 비교할 수 있습니다.");
  if (!raids.length || !spots.length || limit === 0) return [];
  const groups = groupRaidPoints(raids);
  const trees = new Map<string, TreeNode>();
  const candidates: Candidate[] = [];
  const radiusSquared = radiusSquaredFor(radiusKm);
  const coversGlobe = radiusKm >= HALF_CIRCUMFERENCE_KM;
  const valid = spots.filter(spot => spot && typeof spot.id === "string" && spot.id.length > 0 && spot.id.length <= 180 && !/[\u0000-\u001f\u007f]/.test(spot.id) && typeof spot.cityId === "string" && typeof spot.name === "string" && spot.name.trim().length > 0 && spot.name.length <= 180 && !/[\u0000-\u001f\u007f]/.test(spot.name) && validPosition(spot) && httpsSource(spot.sourceUrl) && (spot.coordinateSource === undefined || httpsSource(spot.coordinateSource)));
  valid.sort((a, b) => compareText(a.cityId, b.cityId) || compareText(a.id, b.id) || a.lat - b.lat || a.lon - b.lon || compareText(a.name, b.name) || compareText(a.sourceUrl, b.sourceUrl) || compareText(a.coordinateSource ?? "", b.coordinateSource ?? ""));
  const seen = new Set<string>();
  for (const spot of valid) {
    const id = `recommended:${spot.cityId}:${spot.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const points = groups.get(spot.cityId);
    if (!points?.length) continue;
    let tree = trees.get(spot.cityId);
    if (!tree) { tree = buildTree(points); trees.set(spot.cityId, tree); }
    const point: Point = { id, cityId: spot.cityId, lat: spot.lat, lon: spot.lon, gymName: spot.name.trim(), vector: vectorFor(spot), used: false, leaf: null };
    const count = coversGlobe ? tree.count : countWithin(tree, point.vector, radiusSquared);
    if (!count) continue;
    candidates.push({ point, count, communitySpot: { name: spot.name.trim(), sourceUrl: spot.sourceUrl, ...(spot.coordinateSource ? { coordinateSource: spot.coordinateSource } : {}) } });
  }
  return selectCandidates(candidates, trees, radiusSquared, coversGlobe, limit);
}
