Ext.define('PVE.ceph.Services', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveCephServices',

    layout: {
	type: 'hbox',
	align: 'stretch',
    },

    bodyPadding: '0 5 20',
    defaults: {
	xtype: 'box',
	style: {
	    'text-align':'center',
	},
    },

    items: [
	{
	    flex: 1,
	    xtype: 'pveCephServiceList',
	    itemId: 'mons',
	    title: gettext('Monitors'),
	},
	{
	    flex: 1,
	    xtype: 'pveCephServiceList',
	    itemId: 'mgrs',
	    title: gettext('Managers'),
	},
	{
	    flex: 1,
	    xtype: 'pveCephServiceList',
	    itemId: 'mdss',
	    title: gettext('Meta Data Servers'),
	},
    ],

    updateAll: function(metadata, status) {
	var me = this;

	var healthstates = {
	    'HEALTH_UNKNOWN': 0,
	    'HEALTH_ERR': 1,
	    'HEALTH_WARN': 2,
	    'HEALTH_UPGRADE': 3,
	    'HEALTH_OLD': 4,
	    'HEALTH_OK': 5,
	};
	var healthmap = [
	    'HEALTH_UNKNOWN',
	    'HEALTH_ERR',
	    'HEALTH_WARN',
	    'HEALTH_UPGRADE',
	    'HEALTH_OLD',
	    'HEALTH_OK',
	];
	var reduceFn = function(first, second) {
	    return first + '\n' + second.message;
	};
	var maxversion = "00.0.00";
	Object.values(metadata.version || {}).forEach(function(version) {
	    if (PVE.Utils.compare_ceph_versions(version, maxversion) > 0) {
		maxversion = version;
	    }
	});
	var i;
	var quorummap = (status && status.quorum_names) ? status.quorum_names : [];
	var monmessages = {};
	var mgrmessages = {};
	var mdsmessages = {};
	if (status) {
	    if (status.health) {
		Ext.Object.each(status.health.checks, function(key, value, obj) {
		    if (!Ext.String.startsWith(key, "MON_")) {
			return;
		    }

		    var i;
		    for (i = 0; i < value.detail.length; i++) {
			var match = value.detail[i].message.match(/mon.([a-zA-Z0-9\-\.]+)/);
			if (!match) {
			    continue;
			}
			var monid = match[1];

			if (!monmessages[monid]) {
			    monmessages[monid] = {
				worstSeverity: healthstates.HEALTH_OK,
				messages: [],
			    };
			}


			monmessages[monid].messages.push(
							 PVE.Utils.get_ceph_icon_html(value.severity, true) +
							 Ext.Array.reduce(value.detail, reduceFn, ''),
			);
			if (healthstates[value.severity] < monmessages[monid].worstSeverity) {
			    monmessages[monid].worstSeverity = healthstates[value.severity];
			}
		    }
		});
	    }

	    if (status.mgrmap) {
		mgrmessages[status.mgrmap.active_name] = "active";
		status.mgrmap.standbys.forEach(function(mgr) {
		    mgrmessages[mgr.name] = "standby";
		});
	    }

	    if (status.fsmap) {
		status.fsmap.by_rank.forEach(function(mds) {
		    mdsmessages[mds.name] = 'rank: ' + mds.rank + "; " + mds.status;
		});
	    }
	}

	var checks = {
	    mon: function(mon) {
		if (quorummap.indexOf(mon.name) !== -1) {
		    mon.health = healthstates.HEALTH_OK;
		} else {
		    mon.health = healthstates.HEALTH_ERR;
		}
		if (monmessages[mon.name]) {
		    if (monmessages[mon.name].worstSeverity < mon.health) {
			mon.health = monmessages[mon.name].worstSeverity;
		    }
		    Array.prototype.push.apply(mon.messages, monmessages[mon.name].messages);
		}
		return mon;
	    },
	    mgr: function(mgr) {
		if (mgrmessages[mgr.name] === 'active') {
		    mgr.title = '<b>' + mgr.title + '</b>';
		    mgr.statuses.push(gettext('Status') + ': <b>active</b>');
		} else if (mgrmessages[mgr.name] === 'standby') {
		    mgr.statuses.push(gettext('Status') + ': standby');
		} else if (mgr.health > healthstates.HEALTH_WARN) {
		    mgr.health = healthstates.HEALTH_WARN;
		}

		return mgr;
	    },
	    mds: function(mds) {
		if (mdsmessages[mds.name]) {
		    mds.title = '<b>' + mds.title + '</b>';
		    mds.statuses.push(gettext('Status') + ': <b>' + mdsmessages[mds.name]+"</b>");
		} else if (mds.addr !== Proxmox.Utils.unknownText) {
		    mds.statuses.push(gettext('Status') + ': standby');
		}

		return mds;
	    },
	};

	for (let type of ['mon', 'mgr', 'mds']) {
	    var ids = Object.keys(metadata[type] || {});
	    me[type] = {};

	    for (let id of ids) {
		var tmp = id.split('@');
		var name = tmp[0];
		var host = tmp[1];
		var result = {
		    id: id,
		    health: healthstates.HEALTH_OK,
		    statuses: [],
		    messages: [],
		    name: name,
		    title: metadata[type][id].name || name,
		    host: host,
		    version: PVE.Utils.parse_ceph_version(metadata[type][id]),
		    service: metadata[type][id].service,
		    addr: metadata[type][id].addr || metadata[type][id].addrs || Proxmox.Utils.unknownText,
		};

		result.statuses = [
		    gettext('Host') + ": " + result.host,
		    gettext('Address') + ": " + result.addr,
		];

		if (checks[type]) {
		    result = checks[type](result);
		}

		if (result.service && !result.version) {
		    result.messages.push(
			PVE.Utils.get_ceph_icon_html('HEALTH_UNKNOWN', true) +
			gettext('Stopped'),
		    );
		    result.health = healthstates.HEALTH_UNKNOWN;
		}

		if (!result.version && result.addr === Proxmox.Utils.unknownText) {
		    result.health = healthstates.HEALTH_UNKNOWN;
		}

		if (result.version) {
		    result.statuses.push(gettext('Version') + ": " + result.version);

		    if (result.version != maxversion) {
			if (metadata.version[result.host] === maxversion) {
			    if (result.health > healthstates.HEALTH_OLD) {
				result.health = healthstates.HEALTH_OLD;
			    }
			    result.messages.push(
				PVE.Utils.get_ceph_icon_html('HEALTH_OLD', true) +
				gettext('A newer version was installed but old version still running, please restart'),
			    );
			} else {
			    if (result.health > healthstates.HEALTH_UPGRADE) {
				result.health = healthstates.HEALTH_UPGRADE;
			    }
			    result.messages.push(
				PVE.Utils.get_ceph_icon_html('HEALTH_UPGRADE', true) +
				gettext('Other cluster members use a newer version of this service, please upgrade and restart'),
			    );
			}
		    }
		}

		result.statuses.push(''); // empty line
		result.text = result.statuses.concat(result.messages).join('<br>');

		result.health = healthmap[result.health];

		me[type][id] = result;
	    }
	}

	me.getComponent('mons').updateAll(Object.values(me.mon));
	me.getComponent('mgrs').updateAll(Object.values(me.mgr));
	me.getComponent('mdss').updateAll(Object.values(me.mds));
    },
});

Ext.define('PVE.ceph.ServiceList', {
    extend: 'Ext.container.Container',
    xtype: 'pveCephServiceList',

    style: {
	'text-align':'center',
    },
    defaults: {
	xtype: 'box',
	style: {
	    'text-align':'center',
	},
    },

    items: [
	{
	    itemId: 'title',
	    data: {
		title: '',
	    },
	    tpl: '<h3>{title}</h3>',
	},
    ],

    updateAll: function(list) {
	var me = this;
	me.suspendLayout = true;

	var i;
	list.sort((a, b) => a.id > b.id ? 1 : a.id < b.id ? -1 : 0);
	var ids = {};
	if (me.ids) {
	    me.ids.forEach(id => ids[id] = true);
	}
	for (i = 0; i < list.length; i++) {
	    var service = me.getComponent(list[i].id);
	    if (!service) {
		// since services are already sorted, and
		// we always have a sorted list
		// we can add it at the service+1 position (because of the title)
		service = me.insert(i+1, {
		    xtype: 'pveCephServiceWidget',
		    itemId: list[i].id,
		});
		if (!me.ids) {
		    me.ids = [];
		}
		me.ids.push(list[i].id);
	    } else {
		delete ids[list[i].id];
	    }
	    service.updateService(list[i].title, list[i].text, list[i].health);
	}

	Object.keys(ids).forEach(function(id) {
	    me.remove(id);
	});
	me.suspendLayout = false;
	me.updateLayout();
    },

    initComponent: function() {
	var me = this;
	me.callParent();
	me.getComponent('title').update({
	    title: me.title,
	});
    },
});

Ext.define('PVE.ceph.ServiceWidget', {
    extend: 'Ext.Component',
    alias: 'widget.pveCephServiceWidget',

    userCls: 'monitor inline-block',
    data: {
	title: '0',
	health: 'HEALTH_ERR',
	text: '',
	iconCls: PVE.Utils.get_health_icon(),
    },

    tpl: [
	'{title}: ',
	'<i class="fa fa-fw {iconCls}"></i>',
    ],

    updateService: function(title, text, health) {
	var me = this;

	me.update(Ext.apply(me.data, {
	    health: health,
	    text: text,
	    title: title,
	    iconCls: PVE.Utils.get_health_icon(PVE.Utils.map_ceph_health[health]),
	}));

	if (me.tooltip) {
	    me.tooltip.setHtml(text);
	}
    },

    listeners: {
	destroy: function() {
	    var me = this;
	    if (me.tooltip) {
		me.tooltip.destroy();
		delete me.tooltip;
	    }
	},
	mouseenter: {
	    element: 'el',
	    fn: function(events, element) {
		var me = this.component;
		if (!me) {
		    return;
		}
		if (!me.tooltip) {
		    me.tooltip = Ext.create('Ext.tip.ToolTip', {
			target: me.el,
			trackMouse: true,
			dismissDelay: 0,
			renderTo: Ext.getBody(),
			html: me.data.text,
		    });
		}
		me.tooltip.show();
	    },
	},
	mouseleave: {
	    element: 'el',
	    fn: function(events, element) {
		var me = this.component;
		if (me.tooltip) {
		    me.tooltip.destroy();
		    delete me.tooltip;
		}
	    },
	},
    },
});
