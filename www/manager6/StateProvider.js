/* This state provider keeps part of the state inside
 * the browser history.
 *
 * We compress (shorten) url using dictionary based compression
 * i.e. use column separated list instead of url encoded hash:
 * #v\d*       version/format
 * :=          indicates string values
 * :\d+        lookup value in dictionary hash
 * #v1:=value1:5:=value2:=value3:...
*/

Ext.define('PVE.StateProvider', {
    extend: 'Ext.state.LocalStorageProvider',

    // private
    setHV: function(name, newvalue, fireEvents) {
	var me = this;

	var changes = false;
	var oldtext = Ext.encode(me.UIState[name]);
	var newtext = Ext.encode(newvalue);
	if (newtext != oldtext) {
	    changes = true;
	    me.UIState[name] = newvalue;
	    //console.log("changed old " + name + " " + oldtext);
	    //console.log("changed new " + name + " " + newtext);
	    if (fireEvents) {
		me.fireEvent("statechange", me, name, { value: newvalue });
	    }
	}
	return changes;
    },

    // private
    hslist: [
	// order is important for notifications
	// [ name, default ]
	['view', 'server'],
	['rid', 'root'],
	['ltab', 'tasks'],
	['nodetab', ''],
	['storagetab', ''],
	['pooltab', ''],
	['kvmtab', ''],
	['lxctab', ''],
	['dctab', '']
    ],

    hprefix: 'v1',

    compDict: {
	replication: 51,
	system: 50,
	monitor: 49,
	'ha-fencing': 48,
	'ha-groups': 47,
	'ha-resources': 46,
	'ceph-log': 45,
	'ceph-crushmap':44,
	'ceph-pools': 43,
	'ceph-osdtree': 42,
	'ceph-disklist': 41,
	'ceph-monlist': 40,
	'ceph-config': 39,
	ceph: 38,
	'firewall-fwlog': 37,
	'firewall-options': 36,
	'firewall-ipset': 35,
	'firewall-aliases': 34,
	'firewall-sg': 33,
	firewall: 32,
	apt: 31,
	members: 30,
	snapshot: 29,
	ha: 28,
	support: 27,
	pools: 26,
	syslog: 25,
	ubc: 24,
	initlog: 23,
	openvz: 22,
	backup: 21,
	resources: 20,
	content: 19,
	root: 18,
	domains: 17,
	roles: 16,
	groups: 15,
	users: 14,
	time: 13,
	dns: 12,
	network: 11,
	services: 10,
	options: 9,
	console: 8,
	hardware: 7,
	permissions: 6,
	summary: 5,
	tasks: 4,
	clog: 3,
	storage: 2,
	folder: 1,
	server: 0
    },

    decodeHToken: function(token) {
	var me = this;

	var state = {};
	if (!token) {
	    Ext.Array.each(me.hslist, function(rec) {
		state[rec[0]] = rec[1];
	    });
	    return state;
	}

	// return Ext.urlDecode(token);

	var items = token.split(':');
	var prefix = items.shift();

	if (prefix != me.hprefix) {
	    return me.decodeHToken();
	}

	Ext.Array.each(me.hslist, function(rec) {
	    var value = items.shift();
	    if (value) {
		if (value[0] === '=') {
		    value = decodeURIComponent(value.slice(1));
		} else {
		    Ext.Object.each(me.compDict, function(key, cv) {
			if (value == cv) {
			    value = key;
			    return false;
			}
		    });
		}
	    }
	    state[rec[0]] = value;
	});

	return state;
    },

    encodeHToken: function(state) {
	var me = this;

	// return Ext.urlEncode(state);

	var ctoken = me.hprefix;
	Ext.Array.each(me.hslist, function(rec) {
	    var value = state[rec[0]];
	    if (!Ext.isDefined(value)) {
		value = rec[1];
	    }
	    value = encodeURIComponent(value);
	    if (!value) {
		ctoken += ':';
	    } else {
		var comp = me.compDict[value];
		if (Ext.isDefined(comp)) {
		    ctoken += ":" + comp;
		} else {
		    ctoken += ":=" + value;
		}
	    }
	});

	return ctoken;
    },

    constructor: function(config){
	var me = this;

	me.callParent([config]);

	me.UIState = me.decodeHToken(); // set default

	var history_change_cb = function(token) {
	    //console.log("HC " + token);
	    if (!token) {
		var res = window.confirm(gettext('Are you sure you want to navigate away from this page?'));
		if (res){
		    // process text value and close...
		    Ext.History.back();
		} else {
		    Ext.History.forward();
		}
		return;
	    }

	    var newstate = me.decodeHToken(token);
	    Ext.Array.each(me.hslist, function(rec) {
		if (typeof newstate[rec[0]] == "undefined") {
		    return;
		}
		me.setHV(rec[0], newstate[rec[0]], true);
	    });
	};

	var start_token = Ext.History.getToken();
	if (start_token) {
	    history_change_cb(start_token);
	} else {
	    var htext = me.encodeHToken(me.UIState);
	    Ext.History.add(htext);
	}

	Ext.History.on('change', history_change_cb);
    },

    get: function(name, defaultValue){
	/*jslint confusion: true */
	var me = this;
	var data;

	if (typeof me.UIState[name] != "undefined") {
	    data = { value: me.UIState[name] };
	} else {
	    data = me.callParent(arguments);
	    if (!data && name === 'GuiCap') {
		data = { vms: {}, storage: {}, access: {}, nodes: {}, dc: {} };
	    }
	}

	//console.log("GET " + name + " " + Ext.encode(data));
	return data;
    },

    clear: function(name){
	var me = this;

	if (typeof me.UIState[name] != "undefined") {
	    me.UIState[name] = null;
	}

	me.callParent(arguments);
    },

    set: function(name, value){
        var me = this;

	//console.log("SET " + name + " " + Ext.encode(value));
	if (typeof me.UIState[name] != "undefined") {
	    var newvalue = value ? value.value : null;
	    if (me.setHV(name, newvalue, false)) {
		var htext = me.encodeHToken(me.UIState);
		Ext.History.add(htext);
	    }
	} else {
	    me.callParent(arguments);
	}
    }
});
