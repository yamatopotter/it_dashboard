import unittest

from mikrotik_migrate import (
    Snapshot, ReadOnlyAPI, RouterOSError, analyze, build_plan, cutover_source, default_layout,
    ordered, port_base, render_cmd, render_rsc, rsc_quote, verify, apply_cmds, Cmd,
)


def ports(n):
    return [{"name": f"ether{i}", "type": "ether", "running": "true", "disabled": "false"} for i in range(1, n + 1)]


def crs_snapshot() -> Snapshot:
    ifaces = ports(24)
    ifaces[0]["name"] = "ether1-7LINK"
    ifaces[0]["mac-address"] = "48:8F:5A:A1:61:75"
    ifaces[1]["name"] = "ether2-RJNET"
    ifaces[1]["mac-address"] = "48:8F:5A:A1:61:77"
    ifaces.append({"name": "BRIDGE-Evora", "type": "bridge", "mac-address": "CC:2D:E0:9F:A1:9E"})
    return Snapshot(
        host="192.168.0.1",
        meta={"board-name": "CRS328-24P-4S+", "version": "7.24 (stable)", "identity": "CS-Evora"},
        interfaces=ifaces,
        poe=[{"name": "ether5", "poe-out": "auto-on"}],
        sections={
            "/interface/list": [{"name": "all", "builtin": "true"}, {"name": "LAN"}, {"name": "WAN"}],
            "/interface/list/member": [
                {"list": "LAN", "interface": "BRIDGE-Evora"},
                {"list": "WAN", "interface": "ether1-7LINK"}, {"list": "WAN", "interface": "ether2-RJNET"},
                {"list": "WAN", "interface": "pppoe-7Link"}],
            "/interface/bridge": [{".id": "*1", "name": "BRIDGE-Evora", "mac-address": "CC:2D:E0:9F:A1:9E",
                                   "protocol-mode": "rstp"}],
            "/interface/bridge/port": [{"bridge": "BRIDGE-Evora", "interface": f"ether{i}"} for i in range(4, 25)],
            "/interface/pppoe-client": [{"name": "pppoe-7Link", "interface": "ether1-7LINK", "user": "u",
                                         "password": "s3cret", "disabled": "false", "running": "true"}],
            "/interface/wireguard": [{"name": "WG-x", "listen-port": "1361", "private-key": "PRIV",
                                      "public-key": "PUB"}],
            "/interface/wireguard/peers": [{"interface": "WG-x", "public-key": "K", "allowed-address": "10.0.0.0/24",
                                            "rx": "9", "last-handshake": "1m"}],
            "/ip/pool": [{"name": "A", "ranges": "1.1.1.1-1.1.1.9", "next-pool": "B", "total": "9"},
                         {"name": "B", "ranges": "2.2.2.1-2.2.2.9"}],
            "/ip/address": [
                {"address": "192.168.0.1/22", "interface": "BRIDGE-Evora"},
                {"address": "192.168.247.2/24", "interface": "ether2-RJNET"},
                {"address": "45.1.1.1/32", "interface": "pppoe-7Link", "dynamic": "true"}],
            "/ip/dhcp-server": [{"name": "dhcp1", "interface": "BRIDGE-Evora", "disabled": "false"}],
            "/ip/dhcp-server/lease": [
                {"address": "192.168.0.50", "mac-address": "AA:AA", "dynamic": "false", "status": "bound"},
                {"address": "192.168.0.99", "mac-address": "BB:BB", "dynamic": "true"}],
            "/ip/dhcp-client": [{"interface": "ether2-RJNET", "disabled": "false"}],
            "/ip/route": [{"dst-address": "0.0.0.0/0", "gateway": "pppoe-7Link", "comment": "WAN-7LINK",
                           "static": "true"},
                          {"dst-address": "192.168.0.0/22", "gateway": "BRIDGE-Evora", "dynamic": "true"}],
            "/ip/firewall/filter": [{"chain": "input", "action": "drop", "in-interface": "pppoe-7Link",
                                     "comment": 'a "q" $x ?'}],
            "/ip/service": [{"name": "telnet", "disabled": "true", "port": "23"},
                            {"name": "resolver", "dynamic": "true", "port": "53"}],
            "/ip/dns": [{"servers": "1.1.1.1", "dynamic-servers": "8.8.8.8"}],
            "/ppp/profile": [{"name": "default", "default": "true", "use-encryption": "default"},
                             {"name": "vpn", "local-address": "10.0.5.1"}],
            "/tool/netwatch": [{"host": "9.9.9.9", "comment": "Netwatch 7LINK", "disabled": "false"}],
            "/system/script": [{"name": "s1", "source": ":log info \"x\"", "run-count": "3"}],
            "/system/identity": [{"name": "CS-Evora"}],
        },
        manual={"/user": 2},
    )


def new_snapshot() -> Snapshot:
    ifaces = [{"name": f"ether{i}", "type": "ether"} for i in range(1, 9)] + \
             [{"name": "sfp-sfpplus1", "type": "ether"}]
    return Snapshot(host="192.168.0.161", meta={"board-name": "RB5009UG+S+", "version": "7.24.5"},
                    interfaces=ifaces,
                    sections={"/ip/address": [{"address": "192.168.0.161/22", "interface": "ether1", "dynamic": "true"}],
                              "/ip/dhcp-client": [{"name": "ether1", "interface": "ether1", "dynamic": "false"}],
                              "/interface/list/member": [
                                  {"list": "WAN", "interface": "ether1"}, {"list": "WAN", "interface": "ether2"},
                                  {"list": "LAN", "interface": "ether3"}, {"list": "LAN", "interface": "ether4"}]})


class MigrateTests(unittest.TestCase):
    def setUp(self):
        self.old, self.new = crs_snapshot(), new_snapshot()
        self.layout = default_layout(self.old, self.new, "ether3", "192.168.0.161")
        self.plan = build_plan(self.old, self.layout)

    def test_layout_detects_wan_bridge_and_mgmt(self):
        self.assertEqual(self.layout.wan, {"ether1": "ether1-7LINK", "ether2": "ether2-RJNET"})
        self.assertEqual(self.layout.bridge, "BRIDGE-Evora")
        self.assertEqual(self.layout.lan, ["ether4", "ether5", "ether6", "ether7", "ether8"])
        self.assertEqual(self.layout.mgmt_address, "192.168.0.161/22")
        self.assertEqual(port_base("ether1-7LINK"), "ether1")

    def test_layout_works_after_new_ports_were_already_renamed(self):
        new = new_snapshot()
        new.interfaces[0]["name"] = "ether1-7LINK"
        new.interfaces[1]["name"] = "ether2-RJNET"
        new.sections["/ip/address"][0]["interface"] = "ether1-7LINK"
        lay = default_layout(self.old, new, "ether3", "192.168.0.161")
        self.assertEqual(lay.wan, {"ether1": "ether1-7LINK", "ether2": "ether2-RJNET"})
        self.assertEqual(lay.mgmt_iface, "ether1")
        self.assertEqual(lay.lan, ["ether4", "ether5", "ether6", "ether7", "ether8"])

    def test_wan_renamed_first_and_bridge_ports_synthesized(self):
        p1 = ordered(self.plan, 1)
        self.assertEqual((p1[0].action, p1[0].attrs, p1[0].find),
                         ("set_find", {"name": "ether1-7LINK"}, ("default-name", "ether1")))
        ports_ = [c.attrs["interface"] for c in p1 if c.path == "/interface/bridge/port"]
        self.assertEqual(ports_, ["ether3", "ether4", "ether5", "ether6", "ether7", "ether8"])

    def test_factory_list_members_are_cleaned_but_wan_members_kept(self):
        plan = build_plan(self.old, self.layout, self.new)
        rm = [(c.find[1], c.find2[1]) for c in plan.cmds if c.action == "remove_find" and c.find2]
        self.assertEqual(rm, [("LAN", "ether3"), ("LAN", "ether4")])
        self.assertEqual(render_cmd([c for c in plan.cmds if c.find2][0]),
                         "/interface/list/member remove [find list=LAN interface=ether3]")

    def test_static_mgmt_address_is_removed_by_address(self):
        self.layout.mgmt_dynamic = False
        p2 = ordered(build_plan(self.old, self.layout), 2)
        self.assertEqual((p2[-1].path, p2[-1].find), ("/ip/address", ("address", "192.168.0.161/22")))

    def test_conflicting_objects_start_disabled_and_are_enabled_in_phase2(self):
        p1 = {c.path: c for c in ordered(self.plan, 1) if c.action == "add"}
        paths = ("/interface/pppoe-client", "/interface/wireguard", "/ip/dhcp-server",
                 "/ip/dhcp-client", "/tool/netwatch")
        for path in paths:
            self.assertEqual(p1[path].attrs["disabled"], "yes", path)
        enables = [c for c in ordered(self.plan, 2) if c.attrs == {"disabled": "no"}]
        self.assertEqual({c.path for c in enables}, set(paths))

    def test_phase2_order_pre_macs_then_enables_then_final_step(self):
        p2 = ordered(self.plan, 2)
        self.assertTrue(p2[0].pre and p2[1].pre and not p2[2].pre)
        final = [c for c in p2 if c.last]
        self.assertEqual([(c.path, c.action) for c in final],
                         [("/ip/address", "add"), ("/interface/ethernet", "set_find"), ("/ip/dhcp-client", "remove_find")])
        self.assertEqual(p2[-3:], final)
        self.assertEqual(final[0].attrs["address"], "192.168.0.1/22")
        self.assertNotIn("vrf", final[0].attrs)
        self.assertEqual(final[1].find, ("name", "ether1-7LINK"))
        self.assertEqual(final[2].find, ("interface", "ether1-7LINK"))
        pre_macs = [c.find[1] for c in p2 if c.pre and c.path == "/interface/ethernet"]
        self.assertEqual(pre_macs, ["ether2-RJNET"])
        p1_addr = [c.attrs["address"] for c in ordered(self.plan, 1) if c.path == "/ip/address"]
        self.assertEqual(p1_addr, ["192.168.247.2/24"])
        mac = next(c for c in p2 if c.path == "/interface/bridge")
        self.assertEqual(mac.attrs, {"auto-mac": "no", "admin-mac": "CC:2D:E0:9F:A1:9E"})

    def test_non_ascii_is_escaped_as_utf8_bytes_in_rsc(self):
        self.assertEqual(rsc_quote("Rede da Farmácia"), r'"Rede da Farm\C3\A1cia"')
        src = cutover_source(ordered(self.plan, 2))
        self.assertTrue(src.isascii())
        self.assertNotIn("=false", src)
        self.assertNotIn("=true", src)
        self.assertIn("disabled=no", src)

    def test_dynamic_builtin_and_readonly_dropped(self):
        p1 = ordered(self.plan, 1)
        self.assertEqual([c.attrs["name"] for c in p1 if c.path == "/ip/pool"], ["B", "A"])
        self.assertNotIn("total", next(c for c in p1 if c.path == "/ip/pool").attrs)
        self.assertEqual([c.attrs["address"] for c in p1 if c.path == "/ip/dhcp-server/lease"], ["192.168.0.50"])
        self.assertEqual([c.attrs["dst-address"] for c in p1 if c.path == "/ip/route"], ["0.0.0.0/0"])
        self.assertNotIn("static", next(c for c in p1 if c.path == "/ip/route").attrs)
        self.assertEqual([c.attrs["name"] for c in p1 if c.path == "/interface/list"], ["LAN", "WAN"])
        svc = [c for c in p1 if c.path == "/ip/service"]
        self.assertEqual(len(svc), 1)
        self.assertEqual(render_cmd(svc[0]), "/ip/service set [find name=telnet] disabled=yes port=23")
        self.assertEqual(next(c for c in p1 if c.path == "/ip/dns").attrs, {"servers": "1.1.1.1"})
        self.assertNotIn("public-key", next(c for c in p1 if c.path == "/interface/wireguard").attrs)
        self.assertNotIn("rx", next(c for c in p1 if c.path == "/interface/wireguard/peers").attrs)

    def test_builtin_ppp_profile_set_and_secrets_masked_in_logs(self):
        p1 = ordered(self.plan, 1)
        self.assertEqual([c.action for c in p1 if c.path == "/ppp/profile"], ["set_find", "add"])
        pppoe = next(c for c in p1 if c.path == "/interface/pppoe-client")
        self.assertEqual(pppoe.attrs["password"], "s3cret")
        self.assertIn("password=***", render_cmd(pppoe, mask=True))
        self.assertNotIn("s3cret", render_cmd(pppoe, mask=True))
        self.assertIn("private-key=PRIV", render_cmd(next(c for c in p1 if c.path == "/interface/wireguard")))

    def test_rsc_quote_and_render(self):
        self.assertEqual(rsc_quote('a "b" $c ?d'), '"a \\"b\\" \\$c \\?d"')
        rsc = render_rsc(self.plan, self.old, self.layout)
        self.assertIn("FASE 1", rsc)
        self.assertIn("FASE 2", rsc)
        self.assertIn("Usuários (2 item(ns))", rsc)

    def test_cutover_script_wraps_each_command(self):
        lines = cutover_source(ordered(self.plan, 2)).splitlines()
        self.assertTrue(all(ln.startswith(":do {") or ln.startswith("/log") for ln in lines))
        self.assertTrue(lines[-2].startswith(":do { /ip/dhcp-client remove [find interface=ether1-7LINK] }"))

    def test_analyze_ok_layout_has_no_blocker_and_flags_poe(self):
        f = analyze(self.old, self.new, self.layout)
        self.assertEqual([x.message for x in f if x.level == "BLOCKER"], [])
        self.assertTrue(any("PoE" in x.message for x in f))

    def test_analyze_blocks_bad_layout(self):
        self.layout.uplink = "ether1"
        self.assertTrue(any(x.level == "BLOCKER" and "mais de um papel" in x.message
                            for x in analyze(self.old, self.new, self.layout)))
        self.layout.wan = {}
        self.assertTrue(any(x.level == "BLOCKER" and "WAN" in x.message
                            for x in analyze(self.old, self.new, self.layout)))

    def test_verify_reports_missing_objects(self):
        new = new_snapshot()
        new.sections["/interface/bridge"] = [{"name": "BRIDGE-Evora"}]
        problems = verify(self.plan, new, 1)
        self.assertTrue(any("/interface/pppoe-client" in p for p in problems))
        self.assertFalse(any("/interface/bridge:" in p for p in problems))

    def test_apply_drops_unknown_params_and_is_idempotent(self):
        class Fake:
            def __init__(self):
                self.sent, self.existing = [], {("/ip/pool", "A")}
            def talk(self, words):
                if words[0].endswith("/print"):
                    name = next((w[len("?name="):] for w in words if w.startswith("?name=")), None)
                    return [{".id": "*1"}] if (words[0][:-6], name) in self.existing else []
                self.sent.append(words)
                for w in words:
                    if w.startswith("=managed=") or w.startswith("=vrf="):
                        raise RouterOSError("unknown parameter " + w[1:].split("=")[0])
                return []
        api, logs = Fake(), []
        cmds = [Cmd("/interface/bridge", "add", {"name": "B", "managed": "false", "vrf": "main", "mtu": "auto"}),
                Cmd("/ip/pool", "add", {"name": "A", "ranges": "1.1.1.1-1.1.1.2"}),
                Cmd("/ip/dns", "set", {"servers": "1.1.1.1"})]
        stats = apply_cmds(api, cmds, lambda st, m: logs.append((st, m)))
        self.assertEqual((stats["OK"], stats["JA"], stats["ERRO"], stats["DESC"]), (2, 1, 0, 1))
        self.assertEqual(api.sent[-2], ["/interface/bridge/add", "=name=B", "=mtu=auto"])
        self.assertIn("managed, vrf", logs[0][1])
        self.assertEqual(logs[1][0], "JA")

    def test_talk_consumes_done_after_trap(self):
        from mikrotik_validate import RouterOSAPI
        api = RouterOSAPI("x", 0, "u", "p")
        queue = [["!trap", "=message=no such command"], ["!done"], ["!re", "=name=ok"], ["!done"]]
        api._write_sentence = lambda words: None
        api._read_sentence = lambda: queue.pop(0)
        with self.assertRaises(RouterOSError):
            api.talk(["/bad/print"])
        self.assertEqual(api.talk(["/good/print"]), [{"name": "ok"}])

    def test_readonly_api_blocks_writes(self):
        class Fake:
            def talk(self, w):
                return []
        ro = ReadOnlyAPI(Fake())
        self.assertEqual(ro.talk(["/ip/address/print"]), [])
        for bad in (["/ip/address/add"], ["/system/reset-configuration"], []):
            with self.assertRaises(RouterOSError):
                ro.talk(bad)


if __name__ == "__main__":
    unittest.main()
