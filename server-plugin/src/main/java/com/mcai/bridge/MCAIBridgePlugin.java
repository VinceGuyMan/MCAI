package com.mcai.bridge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.advancement.Advancement;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.PluginCommand;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Entity;
import org.bukkit.entity.IronGolem;
import org.bukkit.entity.Monster;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockIgniteEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.entity.EntitySpawnEvent;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerPortalEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

public final class MCAIBridgePlugin extends JavaPlugin implements Listener {
    private HttpServer httpServer;
    private final AtomicLong eventCounter = new AtomicLong(1);
    private final ArrayDeque<BridgeEvent> events = new ArrayDeque<>();
    private final Map<String, BridgeRegion> regions = new HashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        Bukkit.getPluginManager().registerEvents(this, this);
        PluginCommand command = getCommand("mcai");
        if (command != null) command.setExecutor(this::handleCommand);
        startBridgeServer();
    }

    @Override
    public void onDisable() {
        stopBridgeServer();
    }

    private boolean handleCommand(CommandSender sender, Command command, String label, String[] args) {
        String subcommand = args.length > 0 ? args[0].toLowerCase(Locale.ROOT) : "status";
        switch (subcommand) {
            case "status":
            case "bridge":
                if (!sender.hasPermission("mcai.status")) return noPermission(sender);
                sender.sendMessage("MCAIBridge " + getDescription().getVersion() + " HTTP=" + (httpServer != null ? "running" : "stopped") + " events=" + events.size() + " regions=" + regions.size());
                return true;
            case "reload":
                if (!sender.hasPermission("mcai.admin")) return noPermission(sender);
                reloadConfig();
                stopBridgeServer();
                startBridgeServer();
                sender.sendMessage("MCAIBridge reloaded.");
                return true;
            case "events":
                if (!sender.hasPermission("mcai.status")) return noPermission(sender);
                sender.sendMessage("Recent MCAI events: " + Math.min(events.size(), 10));
                latestEvents(10).forEach(event -> sender.sendMessage(event.id + " " + event.type + " " + event.message));
                return true;
            case "regions":
                if (!sender.hasPermission("mcai.regions")) return noPermission(sender);
                sender.sendMessage("MCAI regions: " + regions.size());
                regions.values().stream().limit(10).forEach(region -> sender.sendMessage(region.id + " " + region.name + " " + region.type));
                return true;
            case "stopbot":
                if (!sender.hasPermission("mcai.stopbot")) return noPermission(sender);
                recordEvent("bridge_emergency_stop", sender.getName(), null, "Emergency stop requested from /mcai stopbot", Map.of("source", "command"));
                sender.sendMessage("MCAI emergency stop event emitted.");
                return true;
            default:
                sender.sendMessage("Usage: /mcai <status|bridge|reload|events|regions|stopbot>");
                return true;
        }
    }

    private boolean noPermission(CommandSender sender) {
        sender.sendMessage("You do not have permission for that MCAI bridge command.");
        return true;
    }

    private void startBridgeServer() {
        FileConfiguration config = getConfig();
        if (!config.getBoolean("bridge.enabled", true)) {
            getLogger().info("MCAIBridge HTTP disabled by config.");
            return;
        }

        String host = config.getString("bridge.host", "127.0.0.1");
        int port = config.getInt("bridge.port", 8791);
        boolean allowPublic = config.getBoolean("bridge.allow-public-bind", false);
        if (!isLoopbackHost(host) && !allowPublic) {
            getLogger().warning("Refusing non-loopback MCAIBridge bind: " + host);
            return;
        }

        try {
            httpServer = HttpServer.create(new InetSocketAddress(InetAddress.getByName(host), port), 0);
            registerRoutes();
            httpServer.setExecutor(Executors.newSingleThreadExecutor());
            httpServer.start();
            getLogger().info("MCAIBridge listening on http://" + host + ":" + port);
        } catch (IOException error) {
            getLogger().warning("Failed to start MCAIBridge HTTP server: " + error.getMessage());
            httpServer = null;
        }
    }

    private void stopBridgeServer() {
        if (httpServer != null) {
            httpServer.stop(0);
            httpServer = null;
        }
    }

    private void registerRoutes() {
        httpServer.createContext("/status", exchange -> sendJson(exchange, 200, serverStatusJson()));
        httpServer.createContext("/health", exchange -> sendJson(exchange, 200, "{\"ok\":true,\"plugin\":\"MCAIBridge\"}"));
        httpServer.createContext("/events/recent", exchange -> sendJson(exchange, 200, eventsJson(latestEvents(50))));
        httpServer.createContext("/events", exchange -> sendJson(exchange, 200, eventsJson(eventsSince(queryParam(exchange, "since")))));
        httpServer.createContext("/players", this::handlePlayers);
        httpServer.createContext("/regions/near", this::handleRegionsNear);
        httpServer.createContext("/regions", this::handleRegions);
        httpServer.createContext("/protected-blocks", exchange -> sendJson(exchange, 200, protectedBlocksJson()));
        httpServer.createContext("/advancements/recent", exchange -> sendJson(exchange, 200, eventsJson(filterEvents("player_advancement_done", 50))));
        httpServer.createContext("/deaths/recent", exchange -> sendJson(exchange, 200, eventsJson(filterEvents("player_death", 50))));
        httpServer.createContext("/villagers/recent", exchange -> sendJson(exchange, 200, eventsJson(filterEvents("villager_death", 50))));
        httpServer.createContext("/control/emergency-stop", this::handleEmergencyStop);
    }

    private void handlePlayers(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String prefix = "/players/";
        if (path.startsWith(prefix) && path.length() > prefix.length()) {
            String name = path.substring(prefix.length());
            Player player = Bukkit.getPlayerExact(name);
            sendJson(exchange, player == null ? 404 : 200, player == null ? "{\"ok\":false,\"reason\":\"player not online\"}" : playerJson(player));
            return;
        }
        StringBuilder json = new StringBuilder("{\"players\":[");
        boolean first = true;
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (!first) json.append(',');
            json.append(playerJson(player));
            first = false;
        }
        json.append("]}");
        sendJson(exchange, 200, json.toString());
    }

    private void handleRegions(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        String prefix = "/regions/";
        if ("GET".equalsIgnoreCase(method) && path.startsWith(prefix) && path.length() > prefix.length()) {
            BridgeRegion region = regions.get(path.substring(prefix.length()));
            sendJson(exchange, region == null ? 404 : 200, region == null ? "{\"ok\":false,\"reason\":\"region not found\"}" : region.toJson());
            return;
        }
        if ("GET".equalsIgnoreCase(method)) {
            sendJson(exchange, 200, regionsJson(regions.values()));
            return;
        }
        if (!requirePostToken(exchange)) return;
        String body = readBody(exchange);

        if (path.endsWith("/delete")) {
            String id = stringField(body, "id", "");
            BridgeRegion removed = regions.remove(id);
            if (removed == null) {
                sendJson(exchange, 404, "{\"ok\":false,\"reason\":\"region not found\"}");
                return;
            }
            recordEvent("bridge_region_deleted", "bridge", removed.center(), "Region deleted: " + removed.name, Map.of("regionId", removed.id));
            sendJson(exchange, 200, "{\"ok\":true,\"deleted\":" + quote(removed.id) + "}");
            return;
        }

        if (path.endsWith("/update")) {
            BridgeRegion region = parseRegion(body);
            if (region == null || !regions.containsKey(region.id)) {
                sendJson(exchange, 404, "{\"ok\":false,\"reason\":\"region not found\"}");
                return;
            }
            regions.put(region.id, region);
            recordEvent("bridge_region_registered", region.createdBy, region.center(), "Region updated: " + region.name, Map.of("regionId", region.id));
            sendJson(exchange, 200, "{\"ok\":true,\"region\":" + region.toJson() + "}");
            return;
        }

        if (path.endsWith("/register") || "POST".equalsIgnoreCase(method)) {
            BridgeRegion region = parseRegion(body);
            if (region == null) {
                sendJson(exchange, 400, "{\"ok\":false,\"reason\":\"invalid region\"}");
                return;
            }
            regions.put(region.id, region);
            recordEvent("bridge_region_registered", region.createdBy, region.center(), "Region registered: " + region.name, Map.of("regionId", region.id));
            sendJson(exchange, 200, "{\"ok\":true,\"region\":" + region.toJson() + "}");
            return;
        }
        sendJson(exchange, 405, "{\"ok\":false,\"reason\":\"unsupported method\"}");
    }

    private void handleRegionsNear(HttpExchange exchange) throws IOException {
        String world = queryParam(exchange, "world");
        double x = numberParam(exchange, "x", 0);
        double y = numberParam(exchange, "y", 64);
        double z = numberParam(exchange, "z", 0);
        double radius = Math.max(1, Math.min(numberParam(exchange, "radius", 32), 256));
        Location loc = new Location(Bukkit.getWorld(world), x, y, z);
        List<BridgeRegion> near = new ArrayList<>();
        for (BridgeRegion region : regions.values()) {
            if (!region.world.equals(world)) continue;
            if (region.distanceTo(loc) <= radius) near.add(region);
        }
        sendJson(exchange, 200, regionsJson(near));
    }

    private void handleEmergencyStop(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"ok\":false,\"reason\":\"POST required\"}");
            return;
        }
        if (!getConfig().getBoolean("features.emergency-stop", true) || !getConfig().getBoolean("bridge.allow-control", true)) {
            sendJson(exchange, 403, "{\"ok\":false,\"reason\":\"emergency stop disabled\"}");
            return;
        }
        if (!requirePostToken(exchange)) return;
        recordEvent("bridge_emergency_stop", "bridge", null, "Emergency stop requested through bridge API", Map.of("source", "http"));
        sendJson(exchange, 200, "{\"ok\":true,\"message\":\"emergency stop event emitted\"}");
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        recordEvent("player_join", event.getPlayer().getName(), event.getPlayer().getLocation(), event.getPlayer().getName() + " joined", Map.of());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        recordEvent("player_quit", event.getPlayer().getName(), event.getPlayer().getLocation(), event.getPlayer().getName() + " quit", Map.of());
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        if (!getConfig().getBoolean("features.death-events", true)) return;
        Player player = event.getEntity();
        recordEvent("player_death", player.getName(), player.getLocation(), nullToEmpty(event.getDeathMessage()), Map.of());
    }

    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        recordEvent("player_respawn", event.getPlayer().getName(), event.getRespawnLocation(), event.getPlayer().getName() + " respawned", Map.of());
    }

    @EventHandler
    public void onWorld(PlayerChangedWorldEvent event) {
        recordEvent("player_changed_world", event.getPlayer().getName(), event.getPlayer().getLocation(), event.getPlayer().getName() + " changed world", Map.of("from", event.getFrom().getName()));
    }

    @EventHandler
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        if (!getConfig().getBoolean("features.advancements", true)) return;
        Advancement advancement = event.getAdvancement();
        recordEvent("player_advancement_done", event.getPlayer().getName(), event.getPlayer().getLocation(), "Advancement completed", Map.of("key", advancement.getKey().toString()));
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        Entity entity = event.getEntity();
        if (entity instanceof Villager && getConfig().getBoolean("features.villager-events", true)) {
            recordEvent("villager_death", "server", entity.getLocation(), "Villager died", Map.of("entityId", String.valueOf(entity.getEntityId())));
        }
        if (entity instanceof IronGolem) {
            recordEvent("iron_golem_death", "server", entity.getLocation(), "Iron golem died", Map.of("entityId", String.valueOf(entity.getEntityId())));
        }
    }

    @EventHandler
    public void onEntitySpawn(EntitySpawnEvent event) {
        if (!(event.getEntity() instanceof Monster)) return;
        BridgeRegion region = nearestProtectedRegion(event.getLocation(), 24);
        if (region != null) {
            recordEvent("hostile_near_region", "server", event.getLocation(), "Hostile mob spawned near " + region.name, Map.of("regionId", region.id, "entity", event.getEntity().getType().name()));
        }
    }

    @EventHandler
    public void onExplosion(EntityExplodeEvent event) {
        BridgeRegion region = nearestProtectedRegion(event.getLocation(), 32);
        if (region != null) {
            recordEvent("explosion_near_region", "server", event.getLocation(), "Explosion near " + region.name, Map.of("regionId", region.id, "entity", event.getEntityType().name()));
        }
    }

    @EventHandler
    public void onIgnite(BlockIgniteEvent event) {
        BridgeRegion region = nearestProtectedRegion(event.getBlock().getLocation(), 16);
        if (region != null) {
            recordEvent("block_ignite_near_region", "server", event.getBlock().getLocation(), "Block ignite near " + region.name, Map.of("regionId", region.id));
        }
    }

    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        BridgeRegion region = containingProtectedRegion(event.getBlock().getLocation());
        if (region != null) {
            recordEvent("block_break_in_region", event.getPlayer().getName(), event.getBlock().getLocation(), "Block broken in protected region " + region.name, Map.of("regionId", region.id, "block", event.getBlock().getType().name().toLowerCase(Locale.ROOT)));
        }
    }

    @EventHandler
    public void onBlockPlace(BlockPlaceEvent event) {
        BridgeRegion region = containingProtectedRegion(event.getBlock().getLocation());
        if (region != null) {
            recordEvent("block_place_in_region", event.getPlayer().getName(), event.getBlock().getLocation(), "Block placed in protected region " + region.name, Map.of("regionId", region.id, "block", event.getBlock().getType().name().toLowerCase(Locale.ROOT)));
        }
    }

    @EventHandler
    public void onPortal(PlayerPortalEvent event) {
        recordEvent("portal_used", event.getPlayer().getName(), event.getFrom(), event.getPlayer().getName() + " used a portal", Map.of("cause", event.getCause().name()));
    }

    private void recordEvent(String type, String player, Location location, String message, Map<String, String> details) {
        if (!getConfig().getBoolean("features.events", true)) return;
        BridgeEvent event = new BridgeEvent();
        event.id = "evt_" + eventCounter.getAndIncrement();
        event.timestamp = System.currentTimeMillis();
        event.type = type;
        event.world = location != null && location.getWorld() != null ? location.getWorld().getName() : "";
        event.dimension = dimensionFromWorld(event.world);
        event.player = player == null ? "" : player;
        event.position = location;
        event.message = message == null ? type : message;
        event.details = details == null ? Map.of() : details;
        events.addLast(event);
        int max = Math.max(10, getConfig().getInt("bridge.event-buffer-size", 500));
        while (events.size() > max) events.removeFirst();
    }

    private BridgeRegion containingProtectedRegion(Location location) {
        for (BridgeRegion region : regions.values()) {
            if (region.protectedRegion && region.contains(location)) return region;
        }
        return null;
    }

    private BridgeRegion nearestProtectedRegion(Location location, double maxDistance) {
        return regions.values().stream()
                .filter(region -> region.protectedRegion && region.world.equals(worldName(location)))
                .min(Comparator.comparingDouble(region -> region.distanceTo(location)))
                .filter(region -> region.distanceTo(location) <= maxDistance)
                .orElse(null);
    }

    private List<BridgeEvent> latestEvents(int limit) {
        List<BridgeEvent> list = new ArrayList<>(events);
        Collections.reverse(list);
        return list.subList(0, Math.min(limit, list.size()));
    }

    private List<BridgeEvent> filterEvents(String type, int limit) {
        List<BridgeEvent> list = new ArrayList<>();
        for (BridgeEvent event : latestEvents(events.size())) {
            if (event.type.equals(type)) list.add(event);
            if (list.size() >= limit) break;
        }
        return list;
    }

    private List<BridgeEvent> eventsSince(String sinceId) {
        if (sinceId == null || sinceId.isBlank()) return latestEvents(50);
        List<BridgeEvent> list = new ArrayList<>();
        boolean include = false;
        for (BridgeEvent event : events) {
            if (include) list.add(event);
            if (event.id.equals(sinceId)) include = true;
        }
        return list;
    }

    private boolean requirePostToken(HttpExchange exchange) throws IOException {
        if (!getConfig().getBoolean("bridge.require-token", true)) return true;
        String expected = getConfig().getString("bridge.token", "");
        String supplied = exchange.getRequestHeaders().getFirst("X-MCAI-Bridge-Token");
        if (expected == null || expected.isBlank() || !expected.equals(supplied)) {
            sendJson(exchange, 401, "{\"ok\":false,\"reason\":\"bridge token required\"}");
            return false;
        }
        return true;
    }

    private void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (InputStream input = exchange.getRequestBody()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private String serverStatusJson() {
        StringBuilder players = new StringBuilder("[");
        boolean first = true;
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (!first) players.append(',');
            players.append(quote(player.getName()));
            first = false;
        }
        players.append(']');
        StringBuilder worlds = new StringBuilder("[");
        first = true;
        for (World world : Bukkit.getWorlds()) {
            if (!first) worlds.append(',');
            worlds.append(quote(world.getName()));
            first = false;
        }
        worlds.append(']');
        return "{"
                + "\"serverName\":\"local-paper\","
                + "\"minecraftVersion\":" + quote(Bukkit.getMinecraftVersion()) + ","
                + "\"onlinePlayers\":" + players + ","
                + "\"worlds\":" + worlds + ","
                + "\"tps\":20.0,"
                + "\"pluginVersion\":" + quote(getDescription().getVersion()) + ","
                + "\"bridgeMode\":\"local_http\","
                + "\"eventCount\":" + events.size() + ","
                + "\"regionCount\":" + regions.size()
                + "}";
    }

    private String eventsJson(Collection<BridgeEvent> source) {
        StringBuilder json = new StringBuilder("{\"events\":[");
        boolean first = true;
        for (BridgeEvent event : source) {
            if (!first) json.append(',');
            json.append(event.toJson());
            first = false;
        }
        json.append("]}");
        return json.toString();
    }

    private String regionsJson(Collection<BridgeRegion> source) {
        StringBuilder json = new StringBuilder("{\"regions\":[");
        boolean first = true;
        for (BridgeRegion region : source) {
            if (!first) json.append(',');
            json.append(region.toJson());
            first = false;
        }
        json.append("]}");
        return json.toString();
    }

    private String playerJson(Player player) {
        return "{"
                + "\"name\":" + quote(player.getName()) + ","
                + "\"uuid\":" + quote(player.getUniqueId().toString()) + ","
                + "\"world\":" + quote(worldName(player.getLocation())) + ","
                + "\"dimension\":" + quote(dimensionFromWorld(worldName(player.getLocation()))) + ","
                + "\"position\":" + locationJson(player.getLocation()) + ","
                + "\"health\":" + player.getHealth() + ","
                + "\"food\":" + player.getFoodLevel()
                + "}";
    }

    private String protectedBlocksJson() {
        return "{\"protectedBlocks\":[\"chest\",\"barrel\",\"bed\",\"furnace\",\"crafting_table\",\"portal\",\"farmland\",\"villager\",\"animal_pen\"]}";
    }

    private BridgeRegion parseRegion(String json) {
        String id = stringField(json, "id");
        String name = stringField(json, "name");
        String type = stringField(json, "type");
        String world = stringField(json, "world");
        if (id.isBlank()) id = "region_" + UUID.randomUUID();
        if (name.isBlank()) name = id;
        if (type.isBlank()) type = "custom";
        if (world.isBlank()) world = Bukkit.getWorlds().isEmpty() ? "world" : Bukkit.getWorlds().get(0).getName();
        BridgeRegion region = new BridgeRegion();
        region.id = sanitizeId(id);
        region.name = name;
        region.type = type;
        region.world = world;
        region.dimension = dimensionFromWorld(world);
        region.minX = numberField(json, "minX", numberNested(json, "min", "x", 0));
        region.minY = numberField(json, "minY", numberNested(json, "min", "y", 0));
        region.minZ = numberField(json, "minZ", numberNested(json, "min", "z", 0));
        region.maxX = numberField(json, "maxX", numberNested(json, "max", "x", 0));
        region.maxY = numberField(json, "maxY", numberNested(json, "max", "y", 255));
        region.maxZ = numberField(json, "maxZ", numberNested(json, "max", "z", 0));
        region.protectedRegion = !json.contains("\"protected\":false");
        region.createdBy = stringField(json, "createdBy").isBlank() ? "ModVinny" : stringField(json, "createdBy");
        region.createdAt = System.currentTimeMillis();
        region.notes = stringField(json, "notes");
        return region.normalized();
    }

    private static boolean isLoopbackHost(String host) {
        return "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host) || "::1".equals(host);
    }

    private static String queryParam(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null) return "";
        for (String part : query.split("&")) {
            String[] pieces = part.split("=", 2);
            if (pieces.length == 2 && pieces[0].equals(key)) return pieces[1].replace("%20", " ");
        }
        return "";
    }

    private static double numberParam(HttpExchange exchange, String key, double fallback) {
        try {
            return Double.parseDouble(queryParam(exchange, key));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String stringField(String json, String key) {
        String pattern = "\"" + key + "\"";
        int start = json.indexOf(pattern);
        if (start < 0) return "";
        int colon = json.indexOf(':', start + pattern.length());
        int quoteStart = json.indexOf('"', colon + 1);
        int quoteEnd = quoteStart >= 0 ? json.indexOf('"', quoteStart + 1) : -1;
        if (quoteStart < 0 || quoteEnd < 0) return "";
        return json.substring(quoteStart + 1, quoteEnd);
    }

    private static double numberField(String json, String key, double fallback) {
        String pattern = "\"" + key + "\"";
        int start = json.indexOf(pattern);
        if (start < 0) return fallback;
        int colon = json.indexOf(':', start + pattern.length());
        if (colon < 0) return fallback;
        int end = colon + 1;
        while (end < json.length() && " -0123456789.".indexOf(json.charAt(end)) >= 0) end += 1;
        try {
            return Double.parseDouble(json.substring(colon + 1, end).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static double numberNested(String json, String objectKey, String key, double fallback) {
        int objectStart = json.indexOf("\"" + objectKey + "\"");
        if (objectStart < 0) return fallback;
        int objectEnd = json.indexOf('}', objectStart);
        if (objectEnd < 0) return fallback;
        return numberField(json.substring(objectStart, objectEnd), key, fallback);
    }

    private static String sanitizeId(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_\\-]", "_");
    }

    private static String dimensionFromWorld(String world) {
        String lower = world == null ? "" : world.toLowerCase(Locale.ROOT);
        if (lower.contains("nether")) return "nether";
        if (lower.contains("end")) return "end";
        return "overworld";
    }

    private static String worldName(Location location) {
        return location != null && location.getWorld() != null ? location.getWorld().getName() : "";
    }

    private static String locationJson(Location location) {
        if (location == null) return "{\"x\":0,\"y\":0,\"z\":0}";
        return "{\"x\":" + Math.floor(location.getX()) + ",\"y\":" + Math.floor(location.getY()) + ",\"z\":" + Math.floor(location.getZ()) + "}";
    }

    private static String quote(String value) {
        return "\"" + nullToEmpty(value).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static final class BridgeEvent {
        String id;
        long timestamp;
        String type;
        String world;
        String dimension;
        String player;
        Location position;
        String message;
        Map<String, String> details;

        String toJson() {
            StringBuilder detailsJson = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, String> entry : details.entrySet()) {
                if (!first) detailsJson.append(',');
                detailsJson.append(quote(entry.getKey())).append(':').append(quote(entry.getValue()));
                first = false;
            }
            detailsJson.append('}');
            return "{"
                    + "\"id\":" + quote(id) + ","
                    + "\"timestamp\":" + timestamp + ","
                    + "\"type\":" + quote(type) + ","
                    + "\"world\":" + quote(world) + ","
                    + "\"dimension\":" + quote(dimension) + ","
                    + "\"player\":" + quote(player) + ","
                    + "\"position\":" + locationJson(position) + ","
                    + "\"message\":" + quote(message) + ","
                    + "\"details\":" + detailsJson
                    + "}";
        }
    }

    private static final class BridgeRegion {
        String id;
        String name;
        String type;
        String world;
        String dimension;
        double minX;
        double minY;
        double minZ;
        double maxX;
        double maxY;
        double maxZ;
        boolean protectedRegion;
        String createdBy;
        long createdAt;
        String notes;

        BridgeRegion normalized() {
            double a;
            if (minX > maxX) { a = minX; minX = maxX; maxX = a; }
            if (minY > maxY) { a = minY; minY = maxY; maxY = a; }
            if (minZ > maxZ) { a = minZ; minZ = maxZ; maxZ = a; }
            return this;
        }

        boolean contains(Location location) {
            if (location == null || !world.equals(worldName(location))) return false;
            return location.getX() >= minX && location.getX() <= maxX
                    && location.getY() >= minY && location.getY() <= maxY
                    && location.getZ() >= minZ && location.getZ() <= maxZ;
        }

        double distanceTo(Location location) {
            if (location == null || !world.equals(worldName(location))) return Double.MAX_VALUE;
            double cx = (minX + maxX) / 2.0;
            double cy = (minY + maxY) / 2.0;
            double cz = (minZ + maxZ) / 2.0;
            double dx = location.getX() - cx;
            double dy = location.getY() - cy;
            double dz = location.getZ() - cz;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        Location center() {
            World bukkitWorld = Bukkit.getWorld(world);
            return new Location(bukkitWorld, (minX + maxX) / 2.0, (minY + maxY) / 2.0, (minZ + maxZ) / 2.0);
        }

        String toJson() {
            return "{"
                    + "\"id\":" + quote(id) + ","
                    + "\"name\":" + quote(name) + ","
                    + "\"type\":" + quote(type) + ","
                    + "\"world\":" + quote(world) + ","
                    + "\"dimension\":" + quote(dimension) + ","
                    + "\"min\":{\"x\":" + minX + ",\"y\":" + minY + ",\"z\":" + minZ + "},"
                    + "\"max\":{\"x\":" + maxX + ",\"y\":" + maxY + ",\"z\":" + maxZ + "},"
                    + "\"protected\":" + protectedRegion + ","
                    + "\"createdBy\":" + quote(createdBy) + ","
                    + "\"createdAt\":" + createdAt + ","
                    + "\"notes\":" + quote(notes)
                    + "}";
        }
    }
}
