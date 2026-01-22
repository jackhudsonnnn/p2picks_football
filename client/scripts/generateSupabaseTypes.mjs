#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientRoot = resolve(__dirname, '..');

const defaultSchemaPath = resolve(clientRoot, '..', 'promptEngineering', 'supabase_schema', 'schema.json');
const schemaPath = process.env.SUPABASE_SCHEMA_JSON_PATH
  ? resolve(clientRoot, process.env.SUPABASE_SCHEMA_JSON_PATH)
  : defaultSchemaPath;
const outputPath = resolve(clientRoot, 'src', 'data', 'types', 'database.types.ts');

function loadSchema(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read Supabase schema JSON at ${path}: ${(error && error.message) || error}`);
  }
}

const typeMapping = {
  uuid: 'string',
  text: 'string',
  boolean: 'boolean',
  numeric: 'string',
  integer: 'number',
  bigint: 'string',
  'double precision': 'number',
  'timestamp with time zone': 'string',
  json: 'Json',
  jsonb: 'Json',
};

// Known enum definitions (extend as needed)
const enumValues = {
  league: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'U2Pick'],
  bet_lifecycle_status: ['active', 'pending', 'resolved', 'washed'],
  friend_request_status: ['pending', 'accepted', 'declined'],
};

function getEnumTypeName(column) {
  const dataType = String(column.data_type || '').toLowerCase();
  if (dataType !== 'user-defined') return null;
  // Infer enum name from default (::enumname)
  const defaultText = String(column.column_default || '');
  const match = defaultText.match(/::"?([a-zA-Z0-9_]+)"?/);
  return match ? match[1] : null;
}

function toTsType(dbType) {
  const normalized = String(dbType).toLowerCase();
  if (normalized in typeMapping) {
    return typeMapping[normalized];
  }
  if (normalized === 'user-defined') {
    return 'string';
  }
  console.warn(`[generateSupabaseTypes] Unmapped data type "${dbType}" – defaulting to unknown.`);
  return 'unknown';
}

function parseForeignKey(keyInfo) {
  if (typeof keyInfo !== 'string' || !keyInfo.includes('FOREIGN KEY')) {
    return null;
  }
  const match = keyInfo.match(/FOREIGN KEY -> ([^(]+)\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const [, relation, column] = match;
  return {
    referencedRelation: relation.trim(),
    referencedColumn: column.trim(),
  };
}

function buildTables(schemaRows) {
  const tables = new Map();
  for (const row of schemaRows) {
    const tableName = row.table_name;
    if (!tables.has(tableName)) {
      tables.set(tableName, {
        columns: new Map(),
        relationships: [],
      });
    }
    const table = tables.get(tableName);
    if (!table.columns.has(row.column_name)) {
      table.columns.set(row.column_name, row);
    }

    const fk = parseForeignKey(row.key_info);
    if (fk) {
      const foreignKeyName = `${tableName}_${row.column_name}_fkey`;
      const exists = table.relationships.some(
        (rel) =>
          rel.foreignKeyName === foreignKeyName ||
          (rel.referencedRelation === fk.referencedRelation &&
            rel.columns.length === 1 &&
            rel.columns[0] === row.column_name),
      );
      if (!exists) {
        table.relationships.push({
          foreignKeyName,
          columns: [row.column_name],
          referencedRelation: fk.referencedRelation,
          referencedColumns: [fk.referencedColumn],
        });
      }
    }
  }
  return tables;
}

function formatRowType(column, usedEnums) {
  const enumName = getEnumTypeName(column);
  let baseType;

  if (enumName && enumValues[enumName]) {
    usedEnums.add(enumName);
    baseType = enumValues[enumName].map((v) => JSON.stringify(v)).join(' | ');
  } else {
    baseType = toTsType(column.data_type);
  }

  if (column.is_nullable === 'YES') {
    return `${baseType} | null`;
  }
  return baseType;
}

function hasDefault(column) {
  if (column.column_default === null || column.column_default === undefined) return false;
  const defaultValue = String(column.column_default).toLowerCase();
  if (!defaultValue.length) return false;
  return defaultValue !== 'null';
}

function formatInsertProp(column, usedEnums) {
  const valueType = formatRowType(column, usedEnums);
  const optional = column.is_nullable === 'YES' || hasDefault(column);
  return { optional, valueType };
}

function generateTypes(tables) {
  const lines = [];
  const usedEnums = new Set();
  lines.push('// ------------------------------------------------------------');
  lines.push('// ⚠️  This file is auto-generated. Do not edit directly.');
  lines.push('// ------------------------------------------------------------');
  lines.push('');
  lines.push('export type Json =');
  lines.push('  | string');
  lines.push('  | number');
  lines.push('  | boolean');
  lines.push('  | null');
  lines.push('  | { [key: string]: Json | undefined }');
  lines.push('  | Json[];');
  lines.push('');
  lines.push('export interface Database {');
  lines.push('  public: {');
  lines.push('    Tables: {');

  const tableNames = Array.from(tables.keys()).sort();
  for (const tableName of tableNames) {
    const table = tables.get(tableName);
    const columns = Array.from(table.columns.values()).sort((a, b) =>
      a.column_name.localeCompare(b.column_name),
    );
    const relationships = table.relationships.slice().sort((a, b) => a.foreignKeyName.localeCompare(b.foreignKeyName));

    lines.push(`      ${JSON.stringify(tableName)}: {`);

    lines.push('        Row: {');
    for (const column of columns) {
      lines.push(`          ${JSON.stringify(column.column_name)}: ${formatRowType(column, usedEnums)};`);
    }
    lines.push('        };');

    lines.push('        Insert: {');
    for (const column of columns) {
      const { optional, valueType } = formatInsertProp(column, usedEnums);
      const optionalToken = optional ? '?' : '';
      lines.push(`          ${JSON.stringify(column.column_name)}${optionalToken}: ${valueType};`);
    }
    lines.push('        };');

    lines.push('        Update: {');
    for (const column of columns) {
      lines.push(`          ${JSON.stringify(column.column_name)}?: ${formatRowType(column, usedEnums)};`);
    }
    lines.push('        };');

    if (relationships.length === 0) {
      lines.push('        Relationships: [];');
    } else {
      lines.push('        Relationships: [');
      relationships.forEach((relationship) => {
        lines.push('          {');
        lines.push(`            foreignKeyName: ${JSON.stringify(relationship.foreignKeyName)};`);
        lines.push(
          `            columns: [${relationship.columns.map((column) => JSON.stringify(column)).join(', ')}];`,
        );
        lines.push(
          `            referencedRelation: ${JSON.stringify(relationship.referencedRelation)};`,
        );
        lines.push(
          `            referencedColumns: [${relationship.referencedColumns
            .map((column) => JSON.stringify(column))
            .join(', ')}];`,
        );
        lines.push('          },');
      });
      lines.push('        ];');
    }
    lines.push('      };');
  }

  lines.push('    };');
  lines.push('    Views: Record<string, never>;');
  lines.push('    Functions: Record<string, never>;');
  if (usedEnums.size === 0) {
    lines.push('    Enums: Record<string, never>;');
  } else {
    lines.push('    Enums: {');
    Array.from(usedEnums)
      .sort()
      .forEach((enumName) => {
        const variants = enumValues[enumName] || [];
        const union = variants.map((v) => JSON.stringify(v)).join(' | ');
        lines.push(`      ${enumName}: ${union};`);
      });
    lines.push('    };');
  }
  lines.push('    CompositeTypes: Record<string, never>;');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push('export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];');
  lines.push('export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];');
  lines.push('export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];');

  return `${lines.join('\n')}`;
}

function run() {
  const schemaRows = loadSchema(schemaPath);
  if (!Array.isArray(schemaRows)) {
    throw new Error('Supabase schema JSON must parse to an array of rows.');
  }
  const tables = buildTables(schemaRows);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });
  const content = generateTypes(tables);
  writeFileSync(outputPath, content + '\n', 'utf8');
  console.log(`Supabase types generated -> ${outputPath}`);
}

run();
