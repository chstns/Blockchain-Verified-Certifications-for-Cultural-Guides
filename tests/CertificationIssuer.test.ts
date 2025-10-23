import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, principalCV, listCV, buffCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_GUIDE_PRINCIPAL = 101;
const ERR_INVALID_CERT_DETAILS = 102;
const ERR_INVALID_DOC_HASH = 103;
const ERR_INVALID_EXPIRATION = 104;
const ERR_INVALID_SKILLS = 109;
const ERR_INVALID_LANGUAGES = 110;
const ERR_INVALID_LEVEL = 111;
const ERR_INVALID_REGION = 112;
const ERR_INVALID_CATEGORY = 113;
const ERR_INVALID_STATUS = 114;
const ERR_MAX_CERTS_EXCEEDED = 115;
const ERR_INVALID_UPDATE_PARAM = 116;
const ERR_AUTHORITY_NOT_REGISTERED = 108;
const ERR_INVALID_FEE = 118;
const ERR_INVALID_RENEWAL_PERIOD = 119;
const ERR_CERT_NOT_FOUND = 107;

interface Certification {
  guide: string;
  details: string;
  docHash: Uint8Array;
  issuanceDate: number;
  expirationDate: number;
  issuer: string;
  skills: string[];
  languages: string[];
  level: string;
  region: string;
  category: string;
  status: boolean;
  renewalPeriod: number;
}

interface CertUpdate {
  updateDetails: string;
  updateExpiration: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CertificationIssuerMock {
  state: {
    nextCertId: number;
    maxCertsPerGuide: number;
    issuanceFee: number;
    authorityRegistryContract: string | null;
    certifications: Map<number, Certification>;
    certsByGuide: Map<string, number[]>;
    certUpdates: Map<number, CertUpdate>;
  } = {
    nextCertId: 0,
    maxCertsPerGuide: 5,
    issuanceFee: 500,
    authorityRegistryContract: null,
    certifications: new Map(),
    certsByGuide: new Map(),
    certUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  registeredAuthorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextCertId: 0,
      maxCertsPerGuide: 5,
      issuanceFee: 500,
      authorityRegistryContract: null,
      certifications: new Map(),
      certsByGuide: new Map(),
      certUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.registeredAuthorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  setAuthorityRegistry(contract: string): Result<boolean> {
    if (this.state.authorityRegistryContract !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityRegistryContract = contract;
    return { ok: true, value: true };
  }

  setMaxCertsPerGuide(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    if (!this.state.authorityRegistryContract) return { ok: false, value: ERR_AUTHORITY_NOT_REGISTERED };
    this.state.maxCertsPerGuide = newMax;
    return { ok: true, value: true };
  }

  setIssuanceFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: ERR_INVALID_FEE };
    if (!this.state.authorityRegistryContract) return { ok: false, value: ERR_AUTHORITY_NOT_REGISTERED };
    this.state.issuanceFee = newFee;
    return { ok: true, value: true };
  }

  issueCertification(
    guide: string,
    details: string,
    docHash: Uint8Array,
    expiration: number,
    skills: string[],
    languages: string[],
    level: string,
    region: string,
    category: string,
    renewalPeriod: number
  ): Result<number> {
    const currentCerts = this.state.certsByGuide.get(guide) || [];
    if (currentCerts.length >= this.state.maxCertsPerGuide) return { ok: false, value: ERR_MAX_CERTS_EXCEEDED };
    if (guide === this.caller) return { ok: false, value: ERR_INVALID_GUIDE_PRINCIPAL };
    if (!details || details.length > 200) return { ok: false, value: ERR_INVALID_CERT_DETAILS };
    if (docHash.length !== 32) return { ok: false, value: ERR_INVALID_DOC_HASH };
    if (expiration <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRATION };
    if (skills.length > 10) return { ok: false, value: ERR_INVALID_SKILLS };
    if (languages.length > 5) return { ok: false, value: ERR_INVALID_LANGUAGES };
    if (!["beginner", "intermediate", "expert"].includes(level)) return { ok: false, value: ERR_INVALID_LEVEL };
    if (!region || region.length > 100) return { ok: false, value: ERR_INVALID_REGION };
    if (!["history", "art", "nature", "food"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (renewalPeriod < 30 || renewalPeriod > 365) return { ok: false, value: ERR_INVALID_RENEWAL_PERIOD };
    if (!this.registeredAuthorities.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.authorityRegistryContract) return { ok: false, value: ERR_AUTHORITY_NOT_REGISTERED };

    this.stxTransfers.push({ amount: this.state.issuanceFee, from: this.caller, to: this.state.authorityRegistryContract });

    const id = this.state.nextCertId;
    const cert: Certification = {
      guide,
      details,
      docHash,
      issuanceDate: this.blockHeight,
      expirationDate: expiration,
      issuer: this.caller,
      skills,
      languages,
      level,
      region,
      category,
      status: true,
      renewalPeriod,
    };
    this.state.certifications.set(id, cert);
    this.state.certsByGuide.set(guide, [...currentCerts, id]);
    this.state.nextCertId++;
    return { ok: true, value: id };
  }

  getCert(id: number): Certification | null {
    return this.state.certifications.get(id) || null;
  }

  updateCertification(id: number, updateDetails: string, updateExpiration: number): Result<boolean> {
    const cert = this.state.certifications.get(id);
    if (!cert) return { ok: false, value: ERR_CERT_NOT_FOUND };
    if (cert.issuer !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!cert.status) return { ok: false, value: ERR_INVALID_STATUS };
    if (!updateDetails || updateDetails.length > 200) return { ok: false, value: ERR_INVALID_CERT_DETAILS };
    if (updateExpiration <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRATION };

    const updated: Certification = {
      ...cert,
      details: updateDetails,
      expirationDate: updateExpiration,
    };
    this.state.certifications.set(id, updated);
    this.state.certUpdates.set(id, {
      updateDetails,
      updateExpiration,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getCertCount(): Result<number> {
    return { ok: true, value: this.state.nextCertId };
  }
}

describe("CertificationIssuer", () => {
  let contract: CertificationIssuerMock;

  beforeEach(() => {
    contract = new CertificationIssuerMock();
    contract.reset();
  });

  it("issues a certification successfully", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Certified History Guide",
      docHash,
      1000,
      ["history", "archaeology"],
      ["english", "french"],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const cert = contract.getCert(0);
    expect(cert?.guide).toBe("ST3GUIDE");
    expect(cert?.details).toBe("Certified History Guide");
    expect(cert?.expirationDate).toBe(1000);
    expect(cert?.issuer).toBe("ST1TEST");
    expect(cert?.skills).toEqual(["history", "archaeology"]);
    expect(cert?.languages).toEqual(["english", "french"]);
    expect(cert?.level).toBe("expert");
    expect(cert?.region).toBe("Europe");
    expect(cert?.category).toBe("history");
    expect(cert?.status).toBe(true);
    expect(cert?.renewalPeriod).toBe(180);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects issuance with max certs exceeded", () => {
    contract.setAuthorityRegistry("ST2TEST");
    contract.state.maxCertsPerGuide = 1;
    const docHash = new Uint8Array(32).fill(0);
    contract.issueCertification(
      "ST3GUIDE",
      "Cert1",
      docHash,
      1000,
      [],
      [],
      "beginner",
      "Region",
      "history",
      30
    );
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert2",
      docHash,
      2000,
      [],
      [],
      "intermediate",
      "Region2",
      "art",
      60
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CERTS_EXCEEDED);
  });

  it("rejects issuance by non-registered authority", () => {
    contract.setAuthorityRegistry("ST2TEST");
    contract.caller = "ST4FAKE";
    contract.registeredAuthorities = new Set();
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects issuance without authority registry", () => {
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_REGISTERED);
  });

  it("rejects invalid details", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    const longDetails = "a".repeat(201);
    const result = contract.issueCertification(
      "ST3GUIDE",
      longDetails,
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CERT_DETAILS);
  });

  it("rejects invalid doc hash", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const invalidHash = new Uint8Array(31).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      invalidHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DOC_HASH);
  });

  it("rejects invalid expiration", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      0,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPIRATION);
  });

  it("rejects invalid level", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "invalid",
      "Europe",
      "history",
      180
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LEVEL);
  });

  it("updates a certification successfully", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    contract.issueCertification(
      "ST3GUIDE",
      "Old Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    const result = contract.updateCertification(0, "New Cert", 2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const cert = contract.getCert(0);
    expect(cert?.details).toBe("New Cert");
    expect(cert?.expirationDate).toBe(2000);
    const update = contract.state.certUpdates.get(0);
    expect(update?.updateDetails).toBe("New Cert");
    expect(update?.updateExpiration).toBe(2000);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent cert", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const result = contract.updateCertification(99, "New Cert", 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CERT_NOT_FOUND);
  });

  it("rejects update by non-issuer", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    contract.caller = "ST4FAKE";
    const result = contract.updateCertification(0, "New Cert", 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets issuance fee successfully", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const result = contract.setIssuanceFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.issuanceFee).toBe(1000);
    const docHash = new Uint8Array(32).fill(0);
    contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects issuance fee change without authority registry", () => {
    const result = contract.setIssuanceFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_REGISTERED);
  });

  it("returns correct cert count", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    contract.issueCertification(
      "ST3GUIDE1",
      "Cert1",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      180
    );
    contract.issueCertification(
      "ST3GUIDE2",
      "Cert2",
      docHash,
      2000,
      [],
      [],
      "intermediate",
      "Asia",
      "art",
      90
    );
    const result = contract.getCertCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects issuance with invalid renewal period", () => {
    contract.setAuthorityRegistry("ST2TEST");
    const docHash = new Uint8Array(32).fill(0);
    const result = contract.issueCertification(
      "ST3GUIDE",
      "Cert",
      docHash,
      1000,
      [],
      [],
      "expert",
      "Europe",
      "history",
      20
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RENEWAL_PERIOD);
  });

  it("sets authority registry successfully", () => {
    const result = contract.setAuthorityRegistry("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityRegistryContract).toBe("ST2TEST");
  });
});