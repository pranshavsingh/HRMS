import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '',
    database: 'hrms_disposable_test'
  });

  console.log('=== DEPARTMENT & TEAM COLUMNS ===');
  const [deptCols] = await conn.execute(
    "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='hrms_disposable_test' AND (COLUMN_NAME LIKE '%dept%' OR COLUMN_NAME LIKE '%department%' OR COLUMN_NAME LIKE '%team%')"
  );
  console.log(deptCols);

  console.log('\n=== CURRENT WORKFORCE TABLES SCHEMA ===');
  const workforceTables = [
    'workforce_employee_fixed_assignment',
    'workforce_rotation_definition',
    'workforce_rotation_step',
    'workforce_employee_rotation',
    'workforce_roster_header',
    'workforce_roster_entry',
    'workforce_shift_swap_request'
  ];

  for (const t of workforceTables) {
    console.log(`\n--- TABLE: ${t} ---`);
    const [cols] = await conn.execute(`DESCRIBE ${t}`);
    console.log(cols.map(c => `${c.Field} | ${c.Type} | Null:${c.Null} | Key:${c.Key} | Def:${c.Default}`).join('\n'));
    const [keys] = await conn.execute(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='hrms_disposable_test' AND TABLE_NAME='${t}'`
    );
    console.log('Constraints:', keys.map(k => `${k.CONSTRAINT_NAME} (${k.CONSTRAINT_TYPE})`).join(', '));
  }

  console.log('\n=== CHECK FOREIGN KEYS ON THESE TABLES ===');
  const [fks] = await conn.execute(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA='hrms_disposable_test' AND TABLE_NAME IN ('${workforceTables.join("','")}') AND REFERENCED_TABLE_NAME IS NOT NULL`
  );
  for (const fk of fks) {
    console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`);
  }

  console.log('\n=== ATTENDANCE TABLE COLUMNS & FKS ===');
  const [attCols] = await conn.execute("DESCRIBE attendance_attendance");
  console.log(attCols.map(c => `${c.Field} (${c.Type})`).join(', '));

  await conn.end();
}

main().catch(console.error);
