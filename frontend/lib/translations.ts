/**
 * The source portal serves a Chinese-NZ audience and emits property types in Chinese by default.
 * This map turns the raw values into English for display. The backend algorithm matches
 * on the raw value (so 建地 is correctly routed to bare-section pricing) — translation
 * is purely a UI concern.
 *
 * If a value isn't in the map, the original string is returned unchanged.
 */
const PROPERTY_TYPE_TRANSLATIONS: Record<string, string> = {
  // Houses
  "独立屋": "House",
  "独立别墅": "House",
  "独立式住宅": "House",
  // Townhouses & terraces
  "城市屋": "Townhouse",
  "排房": "Terraced house",
  "联排别墅": "Terraced house",
  // Apartments & units
  "公寓": "Apartment",
  "单元房": "Unit",
  "单元": "Unit",
  // Lifestyle / rural
  "乡村别墅": "Lifestyle property",
  "乡村住宅": "Rural residence",
  // Land / sections
  "建地": "Vacant land",
  "土地": "Land",
  "地皮": "Section",
  "乡村住宅建地": "Rural residential land",
  // Commercial / industrial
  "零售店": "Retail",
  "商铺": "Retail",
  "商业": "Commercial",
  "工业": "Industrial",
  "办公室": "Office",
  // Investment labels
  "自住投资": "Owner-occupier / investment",
  // Misc
  "Unspecified": "—",
  "SingleFamilyResidence": "House",
};

export function translatePropertyType(raw: string | null | undefined): string {
  if (!raw) return "—";
  const trimmed = String(raw).trim();
  return PROPERTY_TYPE_TRANSLATIONS[trimmed] ?? trimmed;
}
