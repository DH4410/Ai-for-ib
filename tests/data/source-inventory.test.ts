import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type InventoryRecord = {
  id: string;
  subject: string;
  documentType: string;
  sourceProvider: string;
  sourceReference: string;
};

async function readExampleInventory(): Promise<InventoryRecord[]> {
  const inventoryPath = resolve(process.cwd(), "data", "source-inventory.example.json");
  const parsed = JSON.parse(await readFile(inventoryPath, "utf8")) as {
    records?: unknown;
  };

  if (!Array.isArray(parsed.records)) {
    throw new Error("source inventory must contain a records array");
  }

  return parsed.records as InventoryRecord[];
}

describe("metadata-only source inventory", () => {
  it("contains the approved IB subjects and providers without direct download URLs", async () => {
    const inventory = await readExampleInventory();

    expect(inventory.map(({ subject }) => subject)).toEqual(
      expect.arrayContaining(["chemistry", "physics", "mathematics"]),
    );
    expect(
      inventory.every(({ sourceProvider }) =>
        ["managebac", "ibdocs"].includes(sourceProvider),
      ),
    ).toBe(true);
    expect(JSON.stringify(inventory)).not.toMatch(/https?:\/\//i);
  });

  it("keeps the first three textbook source IDs and M25 targets explicit", async () => {
    const inventory = await readExampleInventory();
    const ids = inventory.map(({ id }) => id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "chemistry-pearson-2025",
        "physics-oxford-2023",
        "mathematics-aa-hl-higher-book",
        "chemistry-m25-english-hl",
        "physics-m25-english-hl",
        "mathematics-aa-m25-english-hl",
      ]),
    );
  });

  it("keeps provider references metadata-only", async () => {
    const inventory = await readExampleInventory();

    for (const record of inventory) {
      expect(record.id.trim().length).toBeGreaterThan(0);
      expect(record.documentType.trim().length).toBeGreaterThan(0);
      expect(record.sourceReference.trim().length).toBeGreaterThan(0);
      expect(record.sourceReference).not.toMatch(/^(?:https?|ftp):\/\//i);
    }
  });
});
