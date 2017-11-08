Ext.define('PVE.ceph.StatusDetail', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveCephStatusDetail',

    layout: {
	type: 'hbox',
	align: 'stretch'
    },

    bodyPadding: '0 5 20',
    defaults: {
	xtype: 'box',
	style: {
	    'text-align':'center'
	}
    },

    items: [{
	flex: 1,
	itemId: 'monitors',
	xtype: 'container',
	items: [
	    {
		xtype: 'box',
		width: '100%',
		html: '<h3>' + gettext('Monitors') + '</h3>'
	    }
	]
    },{
	flex: 1,
	itemId: 'osds',
	data: {
	    total: 0,
	    upin: 0,
	    upout: 0,
	    downin: 0,
	    downout: 0
	},
	tpl: [
	    '<h3>' + 'OSDs' + '</h3>',
	    '<table class="osds">',
	    '<tr><td></td>',
	    '<td><i class="fa fa-fw good fa-circle"></i>',
	    gettext('In'),
	    '</td>',
	    '<td><i class="fa fa-fw warning fa-circle-o"></i>',
	    gettext('Out'),
	    '</td>',
	    '</tr>',
	    '<tr>',
	    '<td><i class="fa fa-fw good fa-arrow-circle-up"></i>',
	    gettext('Up'),
	    '</td>',
	    '<td>{upin}</td>',
	    '<td>{upout}</td>',
	    '</tr>',
	    '<tr>',
	    '<td><i class="fa fa-fw critical fa-arrow-circle-down"></i>',
	    gettext('Down'),
	    '</td>',
	    '<td>{downin}</td>',
	    '<td>{downout}</td>',
	    '</tr>',
	    '</table>',
	    '<br /><div>',
	    gettext('Total'),
	    ': {total}',
	    '</div>'
	]
    },
    {
	flex: 1.6,
	itemId: 'pgs',
	padding: '0 10',
	data: {
	    states: []
	},
	tpl: [
	    '<h3>' + 'PGs' + '</h3>',
	    '<tpl for="states">',
	    '<div class="left-aligned">{state_name}:</div>',
	    '<div class="right-aligned">{count}</div><br />',
	    '<div style="clear:both"></div>',
	    '</tpl>'
	]
    }],

    updateAll: function(health, monmap, pgmap, osdmap, quorum_names) {
	var me = this;
	me.suspendLayout = true;

	// update pgs sorted
	var pgs_by_state = pgmap.pgs_by_state || [];
	pgs_by_state.sort(function(a,b){
	    return (a.state_name < b.state_name)?-1:(a.state_name === b.state_name)?0:1;
	});
	me.getComponent('pgs').update({states: pgs_by_state});

	var downinregex = /(\d+) osds down/;
	var monnameregex = /^mon.(\S+) /;
	var downin_osds = 0;
	var monmsgs = {};

	// we collect monitor/osd information from the checks
	Ext.Object.each(health.checks, function(key, value, obj) {
	    var found = null;
	    if (key === 'OSD_DOWN') {
		found = value.summary.message.match(downinregex);
		if (found !== null) {
		    downin_osds = parseInt(found[1],10);
		}
	    }
	    else if (Ext.String.startsWith(key, 'MON_')) {
		if (!value.detail) {
		    return;
		}
		found = value.detail[0].message.match(monnameregex);
		if (found !== null) {
		    if (!monmsgs[found[1]]) {
			monmsgs[found[1]] = [];
		    }
		    monmsgs[found[1]].push({
			text: Ext.Array.reduce(value.detail, function(first, second) {
			    return first + '\n' + second.message;
			}, ''),
			severity: value.severity
		    });
		}
	    }
	});

	// update osds counts

	var total_osds = osdmap.osdmap.num_osds || 0;
	var in_osds = osdmap.osdmap.num_in_osds || 0;
	var up_osds = osdmap.osdmap.num_up_osds || 0;
	var out_osds = total_osds - in_osds;
	var down_osds = total_osds - up_osds;

	var downout_osds = down_osds - downin_osds;
	var upin_osds = in_osds - downin_osds;
	var upout_osds = up_osds - upin_osds;
	var osds = {
	    total: total_osds,
	    upin: upin_osds,
	    upout: upout_osds,
	    downin: downin_osds,
	    downout: downout_osds
	};
	me.getComponent('osds').update(osds);

	// update the monitors
	var mons = monmap.mons.sort(function(a,b) {
	    return (a.name < b.name)?-1:(a.name > b.name)?1:0;
	});

	var monContainer = me.getComponent('monitors');

	var i;
	for (i = 0; i < mons.length; i++) {
	    var monitor = monContainer.getComponent('mon.' + mons[i].name);
	    if (!monitor) {
		// since mons are already sorted, and
		// we always have a sorted list
		// we can add it at the mons+1 position (because of the title)
		monitor = monContainer.insert(i+1, {
		    xtype: 'pveCephMonitorWidget',
		    itemId: 'mon.' + mons[i].name
		});
	    }
	    monitor.updateMonitor(mons[i], monmsgs, quorum_names);
	}
	me.suspendLayout = false;
	me.updateLayout();
    }
});

Ext.define('PVE.ceph.MonitorWidget', {
    extend: 'Ext.Component',
    alias: 'widget.pveCephMonitorWidget',

    userCls: 'monitor inline-block',
    data: {
	name: '0',
	health: 'HEALTH_ERR',
	text: '',
	iconCls: PVE.Utils.get_health_icon(),
	addr: ''
    },

    tpl: [
	'{name}: ',
	'<i class="fa fa-fw {iconCls}"></i>'
    ],

    // expects 3 variables which are
    // timestate: the status from timechecks.mons
    // data: the monmap.mons data
    // quorum_names: the quorum_names array
    updateMonitor: function(data, monmsgs, quorum_names) {
	var me = this;
	var state = 'HEALTH_ERR';
	var text = '';
	var healthstates = {
	    'HEALTH_OK': 3,
	    'HEALTH_WARN': 2,
	    'HEALTH_ERR': 1
	};

	if (quorum_names &&
	    quorum_names.indexOf(data.name) !== -1) {
	    state = 'HEALTH_OK';
	}

	if (monmsgs[data.name]) {
	    Ext.Array.forEach(monmsgs[data.name], function(msg) {
		if (healthstates[msg.severity] < healthstates[state]) {
		    state = msg.severity;
		}

		text += msg.text + "\n";
	    });
	}

	me.update(Ext.apply(me.data, {
	    health: state,
	    text: text,
	    addr: data.addr,
	    name: data.name,
	    iconCls: PVE.Utils.get_health_icon(PVE.Utils.map_ceph_health[state])
	}));
    },

    listeners: {
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
			renderTo: Ext.getBody(),
			html: gettext('Monitor') + ': ' + me.data.name + '<br />' +
			      gettext('Address') + ': ' + me.data.addr + '<br />' +
			      gettext('Health')  + ': ' + me.data.health + '<br />' + 
			      me.data.text
		    });
		}
		me.tooltip.show();
	    }
	},
	mouseleave: {
	    element: 'el',
	    fn: function(events, element) {
		var me = this.component;
		if (me.tooltip) {
		    me.tooltip.destroy();
		    delete me.tooltip;
		}
	    }
	}
    }
});
