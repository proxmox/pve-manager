// Some configuration values are complex strings -
// so we need parsers/generators for them.

Ext.define('PVE.Parser', { statics: {

    // this class only contains static functions

    parseACME: function(value) {
	if (!value) {
	    return;
	}

	var res = {};
	var error;

	Ext.Array.each(value.split(','), function(p) {
	    var kv = p.split('=', 2);
	    if (Ext.isDefined(kv[1])) {
		res[kv[0]] = kv[1];
	    } else {
		error = 'Failed to parse key-value pair: '+p;
		return false;
	    }
	});

	if (error !== undefined) {
	    console.error(error);
	    return;
	}

	if (res.domains !== undefined) {
	    res.domains = res.domains.split(/;/);
	}

	return res;
    },

    parseBoolean: function(value, default_value) {
	if (!Ext.isDefined(value)) {
	    return default_value;
	}
	value = value.toLowerCase();
	return value === '1' ||
	       value === 'on' ||
	       value === 'yes' ||
	       value === 'true';
    },

    parsePropertyString: function(value, defaultKey) {
	var res = {},
	    error;

	if (typeof value !== 'string' || value === '') {
	    return res;
	}

	Ext.Array.each(value.split(','), function(p) {
	    var kv = p.split('=', 2);
	    if (Ext.isDefined(kv[1])) {
		res[kv[0]] = kv[1];
	    } else if (Ext.isDefined(defaultKey)) {
		if (Ext.isDefined(res[defaultKey])) {
		    error = 'defaultKey may be only defined once in propertyString';
		    return false; // break
		}
		res[defaultKey] = kv[0];
	    } else {
		error = 'invalid propertyString, not a key=value pair and no defaultKey defined';
		return false; // break
	    }
	});

	if (error !== undefined) {
	    console.error(error);
	    return;
	}

	return res;
    },

    printPropertyString: function(data, defaultKey) {
	var stringparts = [],
	    gotDefaultKeyVal = false,
	    defaultKeyVal;

	Ext.Object.each(data, function(key, value) {
	    if (defaultKey !== undefined && key === defaultKey) {
		gotDefaultKeyVal = true;
		defaultKeyVal = value;
	    } else if (value !== '') {
		stringparts.push(key + '=' + value);
	    }
	});

	stringparts = stringparts.sort();
	if (gotDefaultKeyVal) {
	    stringparts.unshift(defaultKeyVal);
	}

	return stringparts.join(',');
    },

    parseQemuNetwork: function(key, value) {
	if (!(key && value)) {
	    return;
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }

	    var match_res;

	    if ((match_res = p.match(/^(ne2k_pci|e1000|e1000-82540em|e1000-82544gc|e1000-82545em|vmxnet3|rtl8139|pcnet|virtio|ne2k_isa|i82551|i82557b|i82559er)(=([0-9a-f]{2}(:[0-9a-f]{2}){5}))?$/i)) !== null) {
		res.model = match_res[1].toLowerCase();
		if (match_res[3]) {
		    res.macaddr = match_res[3];
		}
	    } else if ((match_res = p.match(/^bridge=(\S+)$/)) !== null) {
		res.bridge = match_res[1];
	    } else if ((match_res = p.match(/^rate=(\d+(\.\d+)?)$/)) !== null) {
		res.rate = match_res[1];
	    } else if ((match_res = p.match(/^tag=(\d+(\.\d+)?)$/)) !== null) {
		res.tag = match_res[1];
	    } else if ((match_res = p.match(/^firewall=(\d+)$/)) !== null) {
		res.firewall = match_res[1];
	    } else if ((match_res = p.match(/^link_down=(\d+)$/)) !== null) {
		res.disconnect = match_res[1];
	    } else if ((match_res = p.match(/^queues=(\d+)$/)) !== null) {
		res.queues = match_res[1];
	    } else if ((match_res = p.match(/^trunks=(\d+(?:-\d+)?(?:;\d+(?:-\d+)?)*)$/)) !== null) {
		res.trunks = match_res[1];
	    } else {
		errors = true;
		return false; // break
	    }
	});

	if (errors || !res.model) {
	    return;
	}

	return res;
    },

    printQemuNetwork: function(net) {

	var netstr = net.model;
	if (net.macaddr) {
	    netstr += "=" + net.macaddr;
	}
	if (net.bridge) {
	    netstr += ",bridge=" + net.bridge;
	    if (net.tag) {
		netstr += ",tag=" + net.tag;
	    }
	    if (net.firewall) {
		netstr += ",firewall=" + net.firewall;
	    }
	}
	if (net.rate) {
	    netstr += ",rate=" + net.rate;
	}
	if (net.queues) {
	    netstr += ",queues=" + net.queues;
	}
	if (net.disconnect) {
	    netstr += ",link_down=" + net.disconnect;
	}
	if (net.trunks) {
	    netstr += ",trunks=" + net.trunks;
	}
	return netstr;
    },

    parseQemuDrive: function(key, value) {
	if (!(key && value)) {
	    return;
	}

	var res = {};

	var match_res = key.match(/^([a-z]+)(\d+)$/);
	if (!match_res) {
	    return;
	}
	res['interface'] = match_res[1];
	res.index = match_res[2];

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }
	    var match_res = p.match(/^([a-z_]+)=(\S+)$/);
	    if (!match_res) {
		if (!p.match(/\=/)) {
		    res.file = p;
		    return; // continue
		}
		errors = true;
		return false; // break
	    }
	    var k = match_res[1];
	    if (k === 'volume') {
		k = 'file';
	    }

	    if (Ext.isDefined(res[k])) {
		errors = true;
		return false; // break
	    }

	    var v = match_res[2];

	    if (k === 'cache' && v === 'off') {
		v = 'none';
	    }

	    res[k] = v;
	});

	if (errors || !res.file) {
	    return;
	}

	return res;
    },

    printQemuDrive: function(drive) {

	var drivestr = drive.file;

	Ext.Object.each(drive, function(key, value) {
	    if (!Ext.isDefined(value) || key === 'file' ||
		key === 'index' || key === 'interface') {
		return; // continue
	    }
	    drivestr += ',' + key + '=' + value;
	});

	return drivestr;
    },

    parseIPConfig: function(key, value) {
	if (!(key && value)) {
	    return;
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }

	    var match_res;
	    if ((match_res = p.match(/^ip=(\S+)$/)) !== null) {
		res.ip = match_res[1];
	    } else if ((match_res = p.match(/^gw=(\S+)$/)) !== null) {
		res.gw = match_res[1];
	    } else if ((match_res = p.match(/^ip6=(\S+)$/)) !== null) {
		res.ip6 = match_res[1];
	    } else if ((match_res = p.match(/^gw6=(\S+)$/)) !== null) {
		res.gw6 = match_res[1];
	    } else {
		errors = true;
		return false; // break
	    }
	});

	if (errors) {
	    return;
	}

	return res;
    },

    printIPConfig: function(cfg) {
	var c = "";
	var str = "";
	if (cfg.ip) {
	    str += "ip=" + cfg.ip;
	    c = ",";
	}
	if (cfg.gw) {
	    str += c + "gw=" + cfg.gw;
	    c = ",";
	}
	if (cfg.ip6) {
	    str += c + "ip6=" + cfg.ip6;
	    c = ",";
	}
	if (cfg.gw6) {
	    str += c + "gw6=" + cfg.gw6;
	    c = ",";
	}
	return str;
    },

    parseOpenVZNetIf: function(value) {
	if (!value) {
	    return;
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(';'), function(item) {
	    if (!item || item.match(/^\s*$/)) {
		return; // continue
	    }

	    var data = {};
	    Ext.Array.each(item.split(','), function(p) {
		if (!p || p.match(/^\s*$/)) {
		    return; // continue
		}
		var match_res = p.match(/^(ifname|mac|bridge|host_ifname|host_mac|mac_filter)=(\S+)$/);
		if (!match_res) {
		    errors = true;
		    return false; // break
		}
		if (match_res[1] === 'bridge'){
		    var bridgevlanf = match_res[2];
		    var bridge_res = bridgevlanf.match(/^(vmbr(\d+))(v(\d+))?(f)?$/);
		    if (!bridge_res) {
			errors = true;
			return false; // break
		    }
		    data.bridge = bridge_res[1];
		    data.tag = bridge_res[4];
		    /*jslint confusion: true*/
		    data.firewall = bridge_res[5] ? 1 : 0;
		    /*jslint confusion: false*/
		} else {
		    data[match_res[1]] = match_res[2];
		}
	    });

	    if (errors || !data.ifname) {
		errors = true;
		return false; // break
	    }

	    data.raw = item;

	    res[data.ifname] = data;
	});

	return errors ? undefined: res;
    },

    printOpenVZNetIf: function(netif) {
	var netarray = [];

	Ext.Object.each(netif, function(iface, data) {
	    var tmparray = [];
	    Ext.Array.each(['ifname', 'mac', 'bridge', 'host_ifname' , 'host_mac', 'mac_filter', 'tag', 'firewall'], function(key) {
		var value = data[key];
		if (key === 'bridge'){
		    if(data.tag){
			value = value + 'v' + data.tag;
		    }
		    if (data.firewall){
			value = value + 'f';
		    }
		}
		if (value) {
		    tmparray.push(key + '=' + value);
		}

	    });
	    netarray.push(tmparray.join(','));
	});

	return netarray.join(';');
    },

    parseLxcNetwork: function(value) {
	if (!value) {
	    return;
	}

	var data = {};
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }
	    var match_res = p.match(/^(bridge|hwaddr|mtu|name|ip|ip6|gw|gw6|tag|rate)=(\S+)$/);
	    if (match_res) {
		data[match_res[1]] = match_res[2];
	    } else if ((match_res = p.match(/^firewall=(\d+)$/)) !== null) {
		data.firewall = PVE.Parser.parseBoolean(match_res[1]);
	    } else {
		// todo: simply ignore errors ?
		return; // continue
	    }
	});

	return data;
    },

    printLxcNetwork: function(data) {
	var tmparray = [];
	Ext.Array.each(['bridge', 'hwaddr', 'mtu', 'name', 'ip',
			'gw', 'ip6', 'gw6', 'firewall', 'tag'], function(key) {
		var value = data[key];
		if (value) {
		    tmparray.push(key + '=' + value);
		}
	});

	/*jslint confusion: true*/
	if (data.rate > 0) {
	    tmparray.push('rate=' + data.rate);
	}
	/*jslint confusion: false*/
	return tmparray.join(',');
    },

    parseLxcMountPoint: function(value) {
	if (!value) {
	    return;
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }
	    var match_res = p.match(/^([a-z_]+)=(.+)$/);
	    if (!match_res) {
		if (!p.match(/\=/)) {
		    res.file = p;
		    return; // continue
		}
		errors = true;
		return false; // break
	    }
	    var k = match_res[1];
	    if (k === 'volume') {
		k = 'file';
	    }

	    if (Ext.isDefined(res[k])) {
		errors = true;
		return false; // break
	    }

	    var v = match_res[2];

	    res[k] = v;
	});

	if (errors || !res.file) {
	    return;
	}

	var m = res.file.match(/^([a-z][a-z0-9\-\_\.]*[a-z0-9]):/i);
	if (m) {
	    res.storage = m[1];
	    res.type = 'volume';
	} else if (res.file.match(/^\/dev\//)) {
	    res.type = 'device';
	} else {
	    res.type = 'bind';
	}

	return res;
    },

    printLxcMountPoint: function(mp) {
	var drivestr = mp.file;

	Ext.Object.each(mp, function(key, value) {
	    if (!Ext.isDefined(value) || key === 'file' ||
		key === 'type' || key === 'storage') {
		return; // continue
	    }
	    drivestr += ',' + key + '=' + value;
	});

	return drivestr;
    },

    parseStartup: function(value) {
	if (value === undefined) {
	    return;
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }

	    var match_res;

	    if ((match_res = p.match(/^(order)?=(\d+)$/)) !== null) {
		res.order = match_res[2];
	    } else if ((match_res = p.match(/^up=(\d+)$/)) !== null) {
		res.up = match_res[1];
	    } else if ((match_res = p.match(/^down=(\d+)$/)) !== null) {
                res.down = match_res[1];
	    } else {
		errors = true;
		return false; // break
	    }
	});

	if (errors) {
	    return;
	}

	return res;
    },

    printStartup: function(startup) {
	var arr = [];
	if (startup.order !== undefined && startup.order !== '') {
	    arr.push('order=' + startup.order);
	}
	if (startup.up !== undefined && startup.up !== '') {
	    arr.push('up=' + startup.up);
	}
	if (startup.down !== undefined && startup.down !== '') {
	    arr.push('down=' + startup.down);
	}

	return arr.join(',');
    },

    parseQemuSmbios1: function(value) {
	var res = value.split(',').reduce(function (accumulator, currentValue) {
	    var splitted = currentValue.split(new RegExp("=(.+)"));
	    accumulator[splitted[0]] = splitted[1];
	    return accumulator;
	}, {});

	if (PVE.Parser.parseBoolean(res.base64, false)) {
	    Ext.Object.each(res, function(key, value) {
		if (key === 'uuid') { return; }
		res[key] = Ext.util.Base64.decode(value);
	    });
	}

	return res;
    },

    printQemuSmbios1: function(data) {

	var datastr = '';
	var base64 = false;
	Ext.Object.each(data, function(key, value) {
	    if (value === '') { return; }
	    if (key === 'uuid') {
		datastr += (datastr !== '' ? ',' : '') + key + '=' + value;
	    } else {
		// values should be base64 encoded from now on, mark config strings correspondingly
		if (!base64) {
		    base64 = true;
		    datastr += (datastr !== '' ? ',' : '') + 'base64=1';
		}
		datastr += (datastr !== '' ? ',' : '') + key + '=' + Ext.util.Base64.encode(value);
	    }
	});

	return datastr;
    },

    parseTfaConfig: function(value) {
	var res = {};

	Ext.Array.each(value.split(','), function(p) {
	    var kva = p.split('=', 2);
	    res[kva[0]] = kva[1];
	});

	return res;
    },

    parseTfaType: function(value) {
	/*jslint confusion: true*/
	var match;
	if (!value || !value.length) {
	    return undefined;
	} else if (value === 'x!oath') {
	    return 'totp';
	} else if (!!(match = value.match(/^x!(.+)$/))) {
	    return match[1];
	} else {
	    return 1;
	}
    },

    parseQemuCpu: function(value) {
	if (!value) {
	    return {};
	}

	var res = {};

	var errors = false;
	Ext.Array.each(value.split(','), function(p) {
	    if (!p || p.match(/^\s*$/)) {
		return; // continue
	    }

	    if (!p.match(/\=/)) {
		if (Ext.isDefined(res.cpu)) {
		    errors = true;
		    return false; // break
		}
		res.cputype = p;
		return; // continue
	    }

	    var match_res = p.match(/^([a-z_]+)=(\S+)$/);
	    if (!match_res) {
		errors = true;
		return false; // break
	    }

	    var k = match_res[1];
	    if (Ext.isDefined(res[k])) {
		errors = true;
		return false; // break
	    }

	    res[k] = match_res[2];
	});

	if (errors || !res.cputype) {
	    return;
	}

	return res;
    },

    printQemuCpu: function(cpu) {
	var cpustr = cpu.cputype;
	var optstr = '';

	Ext.Object.each(cpu, function(key, value) {
	    if (!Ext.isDefined(value) || key === 'cputype') {
		return; // continue
	    }
	    optstr += ',' + key + '=' + value;
	});

	if (!cpustr) {
	    if (optstr) {
		return 'kvm64' + optstr;
	    }
	    return;
	}

	return cpustr + optstr;
    },

    parseSSHKey: function(key) {
	//                |--- options can have quotes--|     type    key        comment
	var keyre = /^(?:((?:[^\s"]|\"(?:\\.|[^"\\])*")+)\s+)?(\S+)\s+(\S+)(?:\s+(.*))?$/;
	var typere = /^(?:ssh-(?:dss|rsa|ed25519)|ecdsa-sha2-nistp\d+)$/;

	var m = key.match(keyre);
	if (!m) {
	    return null;
	}
	if (m.length < 3 || !m[2]) { // [2] is always either type or key
	    return null;
	}
	if (m[1] && m[1].match(typere)) {
	    return {
		type: m[1],
		key: m[2],
		comment: m[3]
	    };
	}
	if (m[2].match(typere)) {
	    return {
		options: m[1],
		type: m[2],
		key: m[3],
		comment: m[4]
	    };
	}
	return null;
    },

    parseACMEPluginData: function(data) {
	let res = {};
	let extradata = [];
	data.split('\n').forEach((line) => {
	    // capture everything after the first = as value
	    let [key, value] = line.split(/=(.+)/);
	    if (value !== undefined) {
		res[key] = value;
	    } else {
		extradata.push(line);
	    }
	});
	return [res, extradata];
    },
}});
