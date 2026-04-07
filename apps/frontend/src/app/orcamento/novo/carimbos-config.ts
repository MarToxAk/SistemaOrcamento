export type CarimboCatalogItem = {
  cod: number;
  desc: string;
};

type CarimboParse = {
  tipo: "Automatico" | "Madeira" | "Outro";
  cor: string;
  marca: string;
  dimensoes: string;
  descricao: string;
};

type CarimboMatch = CarimboCatalogItem & {
  matchScore: number;
};

const CORES_VALIDAS = [
  "BRANCO",
  "PRETO",
  "VERMELHO",
  "AZUL",
  "VERDE",
  "AMARELO",
  "ROSA",
  "ROXO",
  "LILAS",
  "CINZA",
  "RECICLADO",
  "NEON",
  "PRATA",
  "BEBE",
  "AZUL/PRETO",
] as const;

const MARCAS_VALIDAS = ["TRODAT", "NYKON", "COLOP", "CO2"] as const;

export const CARIMBOS_CONFIG = {
  automaticos: [
    { cod: 25395, desc: "CARIMBO AUTOMATICO 40X60 PRETO NYKON" },
    { cod: 25980, desc: "CARIMBO AUTOMATICO 14X38 POCKET VERDE/AZUL TRODAT" },
    { cod: 27102, desc: "CARIMBO AUTO 22X58 TRODAT PRINTY 4913" },
    { cod: 27822, desc: "CARIMBO AUTO REDONDO P4 4642" },
    { cod: 27823, desc: "CARIMBO AUTO REDONDO P4 4630" },
    { cod: 29135, desc: "CARIMBO AUTOMATICO 10X27 PRETO NYKON" },
    { cod: 29136, desc: "CARIMBO AUTOMATICO 10X27 AZUL BEBE NYKON" },
    { cod: 29137, desc: "CARIMBO AUTOMATICO 10X27 ROSA NEON NYKON" },
    { cod: 29138, desc: "CARIMBO AUTOMATICO 10X27 AZUL NYKON" },
    { cod: 29139, desc: "CARIMBO AUTOMATICO 10X27 VERDE NYKON" },
    { cod: 29140, desc: "CARIMBO AUTOMATICO 10X27 BRANCO NYKON" },
    { cod: 29141, desc: "CARIMBO AUTOMATICO 10X27 VERMELHO NYKON" },
    { cod: 29142, desc: "CARIMBO AUTOMATICO 10X27 LILAS NYKON" },
    { cod: 29143, desc: "CARIMBO AUTOMATICO 10X27 PRETO TRODAT" },
    { cod: 29144, desc: "CARIMBO AUTOMATICO 10X27 AZUL TRODAT" },
    { cod: 29145, desc: "CARIMBO AUTOMATICO 10X27 CINZA TRODAT" },
    { cod: 29146, desc: "CARIMBO AUTOMATICO 10X27 VERDE TRODAT" },
    { cod: 29147, desc: "CARIMBO AUTOMATICO 14X38 RECICLADO NYKON" },
    { cod: 29148, desc: "CARIMBO AUTOMATICO 14X38 ROSA NEON NYKON" },
    { cod: 29149, desc: "CARIMBO AUTOMATICO 14X38 VERDE NYKON" },
    { cod: 29150, desc: "CARIMBO AUTOMATICO 14X38 BRANCO NYKON" },
    { cod: 29151, desc: "CARIMBO AUTOMATICO 10X27 VERMELHO TRODAT" },
    { cod: 29152, desc: "CARIMBO AUTOMATICO 14X38 LILAS NYKON" },
    { cod: 29153, desc: "CARIMBO AUTOMATICO 38X14 VERMELHO TRODAT" },
    { cod: 29154, desc: "CARIMBO AUTOMATICO 14X38 PRETO NYKON" },
    { cod: 29225, desc: "CARIMBO AUTOMATICO 58X22 PRETO TRODAT" },
    { cod: 29226, desc: "CARIMBO AUTOMATICO 47X18 CINZA TRODAT" },
    { cod: 29227, desc: "CARIMBO AUTOMATICO 47X18 VERMELHO TRODAT" },
    { cod: 29228, desc: "CARIMBO AUTOMATICO 47X18 PRETO TRODAT" },
    { cod: 29229, desc: "CARIMBO AUTOMATICO 58X22 PRETO CO2 TRODAT" },
    { cod: 29230, desc: "CARIMBO AUTOMATICO 42MM REDONDO TRODAT" },
    { cod: 29231, desc: "CARIMBO AUTOMATICO 30MM REDONDO TRODAT" },
    { cod: 29232, desc: "CARIMBO AUTOMATICO 14X38 POCKET BRANCO TRODAT" },
    { cod: 29233, desc: "CARIMBO AUTOMATICO 14X38 POCKET AZUL/PRETO TRODAT" },
    { cod: 29234, desc: "CARIMBO AUTOMATICO 14X38 POCKET PRATA TRODAT" },
    { cod: 29235, desc: "CARIMBO AUTOMATICO 14X38 POCKET PRETO TRODAT" },
    { cod: 29236, desc: "CARIMBO AUTOMATICO 14X38 POCKET PRETO COLOP" },
    { cod: 29237, desc: "CARIMBO AUTOMATICO 14X38 POCKET ROSA COLOP" },
    { cod: 29238, desc: "CARIMBO AUTOMATICO 14X38 POCKET BRANCO COLOP" },
    { cod: 29239, desc: "CARIMBO AUTOMATICO 47X18 VERMELHO COLOP" },
    { cod: 29240, desc: "CARIMBO AUTOMATICO 47X18 AZUL COLOP" },
  ] as CarimboCatalogItem[],

  madeira: [
    { cod: 12096, desc: "CARIMBO MADEIRA 15X40" },
    { cod: 12097, desc: "CARIMBO MADEIRA 40X60" },
    { cod: 12798, desc: "CARIMBO MADEIRA 10X40" },
    { cod: 13377, desc: "CARIMBO MADEIRA 30X30" },
    { cod: 15095, desc: "CARIMBO MADEIRA 10X35" },
    { cod: 15116, desc: "CARIMBO MADEIRA 10X20" },
    { cod: 18528, desc: "CARIMBO MADEIRA 10X80" },
    { cod: 20075, desc: "CARIMBO MADEIRA50X30" },
    { cod: 22481, desc: "CARIMBO MADEIRA 20X70" },
    { cod: 24765, desc: "CARIMBO MADEIRA 20X50" },
    { cod: 24970, desc: "CARIMBO MADEIRA 25X65" },
    { cod: 25036, desc: "CARIMBO MADEIRA 40X40" },
    { cod: 25213, desc: "CARIMBO MADEIRA 55X60 SCRAPBOOK" },
    { cod: 25214, desc: "CARIMBO MADEIRA 40X40 SCRAPBOOK" },
    { cod: 25234, desc: "CARIMBO MADEIRA 50X50 SCRAPBOOK" },
    { cod: 26331, desc: "CARIMBO MADEIRA 35X75" },
    { cod: 27210, desc: "CARIMBO MADEIRA 25X35" },
    { cod: 27324, desc: "CARIMBO MADEIRA 50X50" },
    { cod: 27647, desc: "CARIMBO MADEIRA 95X140" },
    { cod: 28129, desc: "CARIMBO MADEIRA10X60" },
    { cod: 28293, desc: "CARIMBO 105X105 MADEIRA" },
    { cod: 28294, desc: "CARIMBO MADEIRA 70X70" },
    { cod: 28368, desc: "CARIMBO MADEIRA 95X95" },
    { cod: 28369, desc: "CARIMBO MADEIRA 20X20" },
  ] as CarimboCatalogItem[],

  outros: [
    { cod: 7005, desc: "CARIMBO INFANTIL" },
    { cod: 17955, desc: "CARIMBO NUMERADOR 4836 TRODAT" },
    { cod: 27840, desc: "CARIMBO PEDAGOGICO  EX/FACIAIS" },
    { cod: 28976, desc: "CARIMBO NUMERADOR 321N  NYKON" },
    { cod: 28979, desc: "CARIMBO DATADOR 321D  NYKON" },
  ] as CarimboCatalogItem[],

  coresValidas: CORES_VALIDAS,

  isAutomatico(descricao: string) {
    if (!descricao) return false;
    const desc = descricao.toUpperCase();
    return desc.includes("AUTOMATICO") || desc.includes("AUTO");
  },

  isMadeira(descricao: string) {
    if (!descricao) return false;
    return descricao.toUpperCase().includes("MADEIRA");
  },

  extrairCor(descricao: string) {
    if (!descricao) return "";
    const desc = descricao.toUpperCase();
    for (const cor of CORES_VALIDAS) {
      if (desc.includes(cor)) return cor;
    }
    return "";
  },

  extrairMarca(descricao: string) {
    if (!descricao) return "";
    const desc = descricao.toUpperCase();
    for (const marca of MARCAS_VALIDAS) {
      if (desc.includes(marca)) return marca;
    }
    return "";
  },

  extrairDimensoes(descricao: string) {
    if (!descricao) return "";
    const match = descricao.match(/(\d+)\s*X\s*(\d+)/i);
    if (!match) return "";
    return `${match[1]}X${match[2]}`;
  },

  parseCarimbo(descricao: string): CarimboParse {
    return {
      tipo: this.isAutomatico(descricao) ? "Automatico" : (this.isMadeira(descricao) ? "Madeira" : "Outro"),
      cor: this.extrairCor(descricao),
      marca: this.extrairMarca(descricao),
      dimensoes: this.extrairDimensoes(descricao),
      descricao,
    };
  },

  buscarCarimboCarcaca(descricao: string): CarimboMatch | null {
    if (!descricao || !this.isAutomatico(descricao)) return null;

    const cor = this.extrairCor(descricao);
    const marca = this.extrairMarca(descricao);
    const dimensoes = this.extrairDimensoes(descricao);

    let melhor: CarimboMatch | null = null;

    for (const carimbo of this.automaticos) {
      let score = 0;

      const carcacaCor = this.extrairCor(carimbo.desc);
      const carcacaMarca = this.extrairMarca(carimbo.desc);
      const carcacaDim = this.extrairDimensoes(carimbo.desc);

      if (cor && carcacaCor && cor === carcacaCor) score += 40;
      if (dimensoes && carcacaDim && dimensoes === carcacaDim) score += 30;
      if (marca && carcacaMarca && marca === carcacaMarca) score += 20;
      if (carimbo.desc.toUpperCase() === descricao.toUpperCase()) score += 10;

      if (!melhor || score > melhor.matchScore) {
        melhor = { ...carimbo, matchScore: score };
      }
    }

    return melhor;
  },
};
