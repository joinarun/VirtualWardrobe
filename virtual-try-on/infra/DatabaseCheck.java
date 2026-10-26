import com.google.gson.Gson;
import org.flywaydb.core.Flyway;
import java.sql.*;
import java.util.*;

/** Local operator-only check. Does not start the app, worker or image provider. */
class DatabaseCheck {
    public static void main(String[] args) {
        try {
            String url = System.getenv("VW_DB_CHECK_URL");
            String password = System.getenv("VW_DB_CHECK_PASSWORD");
            String target = System.getenv("VW_DB_CHECK_INSTANCE");
            Flyway flyway = Flyway.configure().dataSource(url, "virtualwardrobe", password)
                    .locations("classpath:db/migration").load();
            flyway.validate();
            if ("true".equals(System.getenv("VW_DB_CHECK_MIGRATE_RESTORE"))) {
                if (target == null || !target.startsWith("virtualwardrobe-restore-")) throw new IllegalArgumentException();
                flyway.migrate();
            }
            Map<String,Object> report = new LinkedHashMap<>();
            report.put("pendingMigrations", flyway.info().pending().length);
            report.put("migrationVersions", Arrays.stream(flyway.info().applied())
                    .map(info -> info.getVersion() == null ? "repeatable" : info.getVersion().getVersion()).toList());
            try (Connection connection = DriverManager.getConnection(url, "virtualwardrobe", password)) {
                try (Statement statement = connection.createStatement()) {
                    statement.setQueryTimeout(15);
                    try (ResultSet result = statement.executeQuery("SELECT current_setting('server_version')")) {
                        result.next(); report.put("postgresVersion", result.getString(1));
                    }
                    Map<String,Long> counts = new LinkedHashMap<>();
                    for (String table : List.of("vw_account", "vw_store", "vw_product", "vw_tryon_job")) {
                        try (ResultSet result = statement.executeQuery("SELECT count(*) FROM " + table)) {
                            result.next(); counts.put(table, result.getLong(1));
                        }
                    }
                    report.put("counts", counts);
                }
            }
            System.out.println("VW_DB_CHECK_JSON=" + new Gson().toJson(report));
        } catch (Exception failure) {
            // Driver/Flyway messages can contain query values or credentials.
            Map<String,Object> error = new LinkedHashMap<>();
            error.put("type", failure.getClass().getSimpleName());
            if (failure instanceof SQLException sql) error.put("sqlState", sql.getSQLState());
            System.out.println("VW_DB_CHECK_ERROR=" + new Gson().toJson(error));
            System.exit(1);
        }
    }
}
