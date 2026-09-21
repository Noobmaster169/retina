import { describe, expect, it } from "vitest";

import { countryByName } from "../../src/reference/countries";
import { locatePort, parsePortName } from "../../src/reference/ports";

/**
 * The names the inbox writes, as the resolver holds them. Nothing here is
 * classification: a name is parsed for its country word and its city words,
 * and the bracketed code is allowed only to break a tie.
 */

describe("countryByName", () => {
  it.each([
    ["PAKISTAN", "PK"],
    ["United Arab Emirates", "AE"],
    ["UAE", "AE"],
    ["US", "US"],
    ["SOUTH KOREA", "KR"],
    ["Türkiye", "TR"],
    ["TURKEY", "TR"],
    ["VIETNAM", "VN"],
    ["Singapore", "SG"],
  ])("%s is %s", (name, code) => {
    expect(countryByName(name)?.code).toBe(code);
  });

  it("is null for a word that is no country", () => {
    expect(countryByName("WESTPORT")).toBeNull();
  });
});

describe("parsePortName", () => {
  it.each([
    ["KARACHI, PAKISTAN (PKKHI)", "KARACHI", "PAKISTAN", "PKKHI"],
    ["CALLAO_PERU", "CALLAO", "PERU", null],
    ["SINGAPORE (SGSIN)", "SINGAPORE", null, "SGSIN"],
    ["NHAVA SHEVA INDIA", "NHAVA SHEVA", "INDIA", null],
    ["PORT KLANG (WESTPORT), MALAYSIA (MYPKG)", "PORT KLANG (WESTPORT)", "MALAYSIA", "MYPKG"],
    ["RUGAO/NANTONG/SHANGHAI, CHINA (CNSHA)", "RUGAO/NANTONG/SHANGHAI", "CHINA", "CNSHA"],
  ])("%s", (name, city, country, code) => {
    expect(parsePortName(name)).toEqual({ city, countryWord: country, code });
  });
});

describe("locatePort", () => {
  it.each([
    ["KARACHI, PAKISTAN (PKKHI)", "PK", 24, 67],
    ["MOMBASA, KENYA", "KE", -4, 40],
    ["MOMBASA, KENYA (AUBNE)", "KE", -4, 40],
    ["FREMANTLE, AUSTRALIA (CLVAP)", "AU", -32, 116],
    ["SINGAPORE (SGSIN)", "SG", 1, 104],
    ["NEW YORK_US", "US", 41, -74],
    ["NHAVA SHEVA, INDIA (INNSA)", "IN", 19, 73],
    ["JEBEL ALI, UAE (AEJEA)", "AE", 25, 55],
    ["HOCHIMINH CITY, VIETNAM (VNSGN)", "VN", 11, 107],
    ["BUSAN, SOUTH KOREA (AUFRE)", "KR", 35, 129],
    ["YANGON_MYANMAR", "MM", 17, 96],
    ["PORT KLANG (WESTPORT), MALAYSIA (MYPKG)", "MY", 3, 101],
    ["RUGAO/NANTONG/SHANGHAI, CHINA", "CN", 31, 121],
    ["GDANSK_POLAND", "PL", 54, 19],
  ])("places %s", (name, code, lat, lon) => {
    const located = locatePort(name);
    expect(located?.country.code).toBe(code);
    expect(Math.abs((located?.lat ?? 999) - lat)).toBeLessThan(1.5);
    expect(Math.abs((located?.lon ?? 999) - lon)).toBeLessThan(1.5);
  });

  it("never lets a wrong bracketed code move a port to another country", () => {
    const busan = locatePort("BUSAN, SOUTH KOREA (AUFRE)");
    expect(busan?.country.code).toBe("KR");
    expect(busan?.locode).not.toBe("AUFRE");
  });

  it("uses the code to choose among a country's candidates when it agrees", () => {
    expect(locatePort("KARACHI, PAKISTAN (PKKHI)")?.locode).toBe("PKKHI");
  });

  it("is null for a name that names no country", () => {
    expect(locatePort("SOMEWHERE FAR")).toBeNull();
  });
});
