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

	    if ((match_res = p.match(/^(ne2k_pci|e1000|rtl8139|pcnet|virtio|ne2k_isa|i82551|i82557b|i82559er)(=([0-9a-f]{2}(:[0-9a-f]{2}){5}))?$/i)) !== null) {
		res.model = match_res[1].toLowerCase();
		if (match_res[3]) {
		    res.macaddr = match_res[3];
		}
	    } else if ((match_res = p.match(/^bridge=(\S+)$/)) !== null) {
		res.bridge = match_res[1];
	    } else if ((match_res = p.match(/^rate=(\d+(\.\d+)?)$/)) !== null) {
		res.rate = match_res[1];
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
	    var match_res = p.match(/^([a-z]+)=(\S+)$/);
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
    }

}});
