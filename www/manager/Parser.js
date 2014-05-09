// Some configuration values are complex strings - 
// so we need parsers/generators for them. 

Ext.define('PVE.Parser', { statics: {

    // this class only contains static functions

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

	    if ((match_res = p.match(/^(ne2k_pci|e1000|vmxnet3|rtl8139|pcnet|virtio|ne2k_isa|i82551|i82557b|i82559er)(=([0-9a-f]{2}(:[0-9a-f]{2}){5}))?$/i)) !== null) {
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
		data[match_res[1]] = match_res[2];
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
	    Ext.Array.each(['ifname', 'mac', 'bridge', 'host_ifname' , 'host_mac', 'mac_filter'], function(key) {
		var value = data[key];
		if (value) {
		    tmparray.push(key + '=' + value);
		}
	    });
	    netarray.push(tmparray.join(','));
	});

	return netarray.join(';');
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
    }

}});
