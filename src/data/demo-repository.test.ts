import { beforeEach, describe, expect, it } from "vitest";
import { DemoRepository } from "./demo-repository";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("DemoRepository", () => {
  let repo: DemoRepository;
  beforeEach(async () => {
    repo = new DemoRepository(mem());
    await repo.signIn({ identifier: "usr_admin", secret: "1234" });
  });

  it("siembra 27 productos, variantes y 30 días de ventas", async () => {
    expect((await repo.listProducts()).length).toBe(27);
    expect((await repo.listVariants()).length).toBeGreaterThan(120);
    expect((await repo.listSales({})).length).toBeGreaterThan(100);
    expect(await repo.getOpenRegister()).toBeNull();
  });

  it("rechaza PIN incorrecto", async () => {
    await expect(repo.signIn({ identifier: "usr_caja", secret: "9999" })).rejects.toThrow("PIN");
  });

  it("vende, descuenta stock, cierra caja cuadrada y anula devolviendo stock", async () => {
    await expect(repo.createSale({ registerId: "x", items: [], tenders: [] })).rejects.toThrow();
    const reg = await repo.openRegister(5000);
    const v = (await repo.listVariants()).find((x) => x.stock >= 2)!;
    const sale = await repo.createSale({
      registerId: reg.id,
      items: [{ variantId: v.id, quantity: 2 }],
      tenders: [{ method: "cash", amount: 100000 }],
    });
    expect(sale.items[0].quantity).toBe(2);
    const after = (await repo.listVariants()).find((x) => x.id === v.id)!;
    expect(after.stock).toBe(v.stock - 2);
    expect(sale.change).toBe(100000 - sale.total);

    await expect(
      repo.createSale({ registerId: reg.id, items: [{ variantId: v.id, quantity: 9999 }], tenders: [{ method: "cash", amount: 1e9 }] }),
    ).rejects.toThrow("Stock insuficiente");

    await repo.addCashMovement({ registerId: reg.id, type: "out", amount: 1000, reason: "Bolsas" });
    const voided = await repo.voidSale(sale.id, "Error de talla");
    expect(voided.status).toBe("voided");
    expect((await repo.listVariants()).find((x) => x.id === v.id)!.stock).toBe(v.stock);

    const closed = await repo.closeRegister({ registerId: reg.id, countedAmount: 4000 });
    expect(closed.expectedAmount).toBe(4000);
    expect(closed.difference).toBe(0);
  });

  it("una venta fallida no deja cambios a medias", async () => {
    const reg = await repo.openRegister(0);
    const v = (await repo.listVariants())[0];
    await expect(
      repo.createSale({ registerId: reg.id, items: [{ variantId: v.id, quantity: 1 }], tenders: [{ method: "cash", amount: 1 }] }),
    ).rejects.toThrow("insuficiente");
    expect((await repo.listVariants())[0].stock).toBe(v.stock);
    expect((await repo.listSales({ registerId: reg.id })).length).toBe(0);
  });

  it("cajero no puede anular ni editar productos", async () => {
    await repo.signIn({ identifier: "usr_caja", secret: "0000" });
    const sale = (await repo.listSales({}))[0];
    await expect(repo.voidSale(sale.id, "x")).rejects.toThrow("administrador");
  });
});
