import { describe, expect, test } from "bun:test";
import {
	buildMediaSearchPlan,
	carModel,
	scoreMediaCandidate,
	sortMediaCandidates,
} from "../media-search-intelligence";

describe("DarkCut intelligent B-roll queries", () => {
	test("recognizes Brazilian car models, including HB20", () => {
		expect(carModel("Recusei financiar um HB20 zero")).toBe("Hyundai HB20");
		expect(carModel("Onix 0km")).toBe("Chevrolet Onix");
		expect(carModel("Corsa de 12 mil")).toBe("Chevrolet Corsa");
		expect(carModel("Gol G5 antigo")).toBe("Volkswagen Gol");
		expect(carModel("ônibus todo dia")).toBeNull();
	});
	test("retains the vehicle and understands finance/dealership context", () => {
		const plan = buildMediaSearchPlan("Você foi na concessionária financiar um HB20 zero.");
		expect(plan.query).toContain("Hyundai HB20");
		expect(plan.query).toContain("car dealership");
		expect(plan.subject).toBe("Hyundai HB20");
		expect(plan.exactVehicle).toBe(true);
		expect(plan.query).not.toContain("você");
	});
	test("financial language is not forwarded literally to English stock searches", () => {
		const plan = buildMediaSearchPlan("As parcelas do banco pesavam no salário.");
		expect(plan.query).toContain("auto loan");
		expect(plan.reason).toBe("financiamento");
	});
	test("uses last named car in adjacent contextual sentence", () => {
		const plan = buildMediaSearchPlan("Mas não quis assinar o contrato.", "O Onix zero estava na loja.");
		expect(plan.query).toContain("Chevrolet Onix");
		expect(plan.query).toContain("auto loan");
	});
	test("a new public transport scene does not inherit the former car", () => {
		const plan = buildMediaSearchPlan("Depois passou a andar de ônibus todo dia.", "Queria um Corsa.");
		expect(plan.query).toContain("public bus");
		expect(plan.query).not.toContain("Chevrolet Corsa");
	});
	test("exact vehicle wins over a differently named model", () => {
		const right = scoreMediaCandidate({
			query:"Hyundai HB20 car dealership",
			title:"Hyundai HB20 car showroom Brazil",
		});
		const wrong = scoreMediaCandidate({
			query:"Hyundai HB20 car dealership",
			title:"Chevrolet Onix dealership car",
		});
		expect(right).toBeGreaterThan(wrong);
		expect(wrong).toBe(-100);
	});
	test("ranks candidates and removes used IDs and model mismatches", () => {
		const result=sortMediaCandidates([
			{source:"pexels",kind:"video",id:"11",title:"car driving"},
			{source:"pexels",kind:"video",id:"12",title:"Hyundai HB20 showroom dealership"},
			{source:"pexels",kind:"video",id:"13",title:"Chevrolet Onix dealership"},
			{source:"pexels",kind:"video",id:"14",title:"Hyundai HB20 car driving"},
		], "Hyundai HB20 car dealership",{
			prefer:"video",
			exclude:new Set(["pexels:video:12"]),
		});
		expect(result[0]?.id).toBe("14");
		expect(result.some(item=>item.id==="12")).toBe(false);
		expect(result.some(item=>item.id==="13")).toBe(false);
	});
	test("abstract scenes generate a searchable fallback without inventing car models", () => {
		const plan=buildMediaSearchPlan("E naquele momento tudo mudou.");
		expect(plan.exactVehicle).toBe(false);
		expect(plan.query.length).toBeGreaterThan(3);
		expect(plan.fallbackQuery.length).toBeGreaterThan(3);
	});
});
