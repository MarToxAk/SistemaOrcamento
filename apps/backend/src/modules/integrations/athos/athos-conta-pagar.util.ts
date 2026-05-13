type Row = Record<string, unknown>;

type ContaPagarFieldKind = "int" | "number" | "string" | "boolean" | "date" | "datetime";

type ContaPagarFieldSpec = {
  property: string;
  columns: string[];
  kind: ContaPagarFieldKind;
};

const CONTA_PAGAR_FIELD_SPECS: ContaPagarFieldSpec[] = [
  { property: "idcontapagar", columns: ["idcontapagar", "id_contapagar", "id"], kind: "int" },
  { property: "idtipoconta", columns: ["idtipoconta", "id_tipoconta"], kind: "int" },
  { property: "idgrupoconta", columns: ["idgrupoconta", "id_grupoconta"], kind: "int" },
  { property: "idsubgrupoconta", columns: ["idsubgrupoconta", "id_subgrupoconta"], kind: "int" },
  { property: "idconta", columns: ["idconta", "id_conta"], kind: "int" },
  { property: "idcentrocusto", columns: ["idcentrocusto", "id_centrocusto"], kind: "int" },
  { property: "numerodocumento", columns: ["numerodocumento", "numero_documento", "numerodoc"], kind: "string" },
  { property: "descricaoconta", columns: ["descricaoconta", "descricao_conta", "descricao"], kind: "string" },
  { property: "dataemissao", columns: ["dataemissao", "data_emissao", "dt_emissao"], kind: "date" },
  { property: "datavencimento", columns: ["datavencimento", "data_vencimento", "dt_vencimento"], kind: "date" },
  { property: "valorconta", columns: ["valorconta", "valor_conta", "valor"], kind: "number" },
  { property: "observacao", columns: ["observacao", "observacoes", "obs"], kind: "string" },
  { property: "statusconta", columns: ["statusconta", "status_conta", "status"], kind: "string" },
  { property: "valorpago", columns: ["valorpago", "valor_pago", "valorquitado"], kind: "number" },
  { property: "jurosconta", columns: ["jurosconta", "juros_conta"], kind: "number" },
  { property: "competenciames", columns: ["competenciames", "competencia_mes"], kind: "string" },
  { property: "competenciaano", columns: ["competenciaano", "competencia_ano"], kind: "string" },
  { property: "desconto", columns: ["desconto"], kind: "number" },
  { property: "datapagamento", columns: ["datapagamento", "data_pagamento", "dataquitacao"], kind: "date" },
  { property: "idfuncionario", columns: ["idfuncionario", "id_funcionario"], kind: "int" },
  { property: "datalancamento", columns: ["datalancamento", "data_lancamento", "datalanc"], kind: "date" },
  { property: "enviaalerta", columns: ["enviaalerta", "envia_alerta"], kind: "boolean" },
  { property: "idnivel5", columns: ["idnivel5", "id_nivel5"], kind: "int" },
  { property: "idfornecedor", columns: ["idfornecedor", "id_fornecedor"], kind: "int" },
  { property: "multaconta", columns: ["multaconta", "multa_conta"], kind: "number" },
  { property: "idorigempagamento", columns: ["idorigempagamento", "id_origem_pagamento"], kind: "int" },
  { property: "ultimaalteracao", columns: ["ultimaalteracao", "ultima_alteracao", "ultimaAlteracao"], kind: "datetime" },
  { property: "sincronizado", columns: ["sincronizado"], kind: "boolean" },
  { property: "historicocontabil", columns: ["historicocontabil", "historico_contabil"], kind: "string" },
  { property: "agruparconta", columns: ["agruparconta", "agrupar_conta"], kind: "boolean" },
  { property: "idloja", columns: ["idloja", "id_loja"], kind: "int" },
  { property: "idbudget", columns: ["idbudget", "id_budget"], kind: "int" },
  { property: "recorrenciafornecedor", columns: ["recorrenciafornecedor", "recorrencia_fornecedor"], kind: "boolean" },
  { property: "exibemsgrecorrencia", columns: ["exibemsgrecorrencia", "exibe_msg_recorrencia"], kind: "boolean" },
  { property: "numeronota", columns: ["numeronota", "numero_nota"], kind: "string" },
];

const CONTA_PAGAR_WRITABLE_FIELD_SPECS = CONTA_PAGAR_FIELD_SPECS.filter((field) => field.property !== "idcontapagar");

function pickRawValue(row: Row, columns: string[]) {
  for (const column of columns) {
    const value = row[column];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function parseNumber(value: unknown, integerOnly: boolean) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return integerOnly ? Math.trunc(value) : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return integerOnly ? Math.trunc(parsed) : parsed;
  }

  return null;
}

function parseBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y", "sim", "s"].includes(normalized)) {
      return true;
    }
    if (["false", "f", "0", "no", "n", "nao"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function parseDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return trimmed;
  }

  return null;
}

function parseDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return trimmed;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function normalizeValue(value: unknown, kind: ContaPagarFieldKind) {
  switch (kind) {
    case "int":
      return parseNumber(value, true);
    case "number":
      return parseNumber(value, false);
    case "boolean":
      return parseBoolean(value);
    case "date":
      return parseDate(value);
    case "datetime":
      return parseDateTime(value);
    case "string":
    default:
      return value === null || value === undefined ? null : String(value).trim();
  }
}

function buildParamExpression(kind: ContaPagarFieldKind, index: number) {
  if (kind === "date") {
    return `CAST($${index} AS date)`;
  }

  if (kind === "datetime") {
    return `CAST($${index} AS timestamp)`;
  }

  return `$${index}`;
}

export function resolveContaPagarIdColumn(columns: Set<string>) {
  return CONTA_PAGAR_FIELD_SPECS[0].columns.find((column) => columns.has(column)) ?? null;
}

export function mapContaPagarRow(row: Row) {
  return CONTA_PAGAR_FIELD_SPECS.reduce<Record<string, unknown>>((accumulator, field) => {
    accumulator[field.property] = normalizeValue(pickRawValue(row, field.columns), field.kind);
    return accumulator;
  }, {});
}

export function buildContaPagarInsertParts(columns: Set<string>, payload: Record<string, unknown>) {
  const insertColumns: string[] = [];
  const valueExpressions: string[] = [];
  const params: unknown[] = [];

  for (const field of CONTA_PAGAR_WRITABLE_FIELD_SPECS) {
    const value = payload[field.property];
    if (value === undefined) {
      continue;
    }

    const column = field.columns.find((candidate) => columns.has(candidate));
    if (!column) {
      continue;
    }

    params.push(value);
    insertColumns.push(`"${column}"`);
    valueExpressions.push(buildParamExpression(field.kind, params.length));
  }

  return { insertColumns, valueExpressions, params };
}

export function buildContaPagarUpdateParts(columns: Set<string>, payload: Record<string, unknown>) {
  const assignments: string[] = [];
  const params: unknown[] = [];

  for (const field of CONTA_PAGAR_WRITABLE_FIELD_SPECS) {
    const value = payload[field.property];
    if (value === undefined) {
      continue;
    }

    const column = field.columns.find((candidate) => columns.has(candidate));
    if (!column) {
      continue;
    }

    params.push(value);
    assignments.push(`"${column}" = ${buildParamExpression(field.kind, params.length)}`);
  }

  return { assignments, params };
}
