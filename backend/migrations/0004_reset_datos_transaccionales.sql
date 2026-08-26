DO $$
BEGIN
    EXECUTE (
        SELECT string_agg('TRUNCATE TABLE ' || schemaname || '.' || tablename || ' RESTART IDENTITY CASCADE', '; ')
        FROM pg_tables
        WHERE schemaname = 'lab'
          AND tablename IN ('resultado', 'producto_aplicado', 'solicitud',
                            'lectura_accutab', 'equipo_accutab',
                            'planta', 'cliente')
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunas tablas no existen, se omitieron.';
END $$;
