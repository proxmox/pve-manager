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
	    '<h3>' + gettext('OSDs') + '</h3>',
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
	    monitors: []
	},
	tpl: [
	    '<h3>' + gettext('PGs') + '</h3>',
	    '<tpl for="monitors">',
	    '<div class="left-aligned">{state_name}:</div>',
	    '<div class="right-aligned">{count}</div><br />',
	    '<div style="clear:both"></div>',
	    '</tpl>'
	]
    }],

    updateAll: function(record) {
	var me = this;
	me.suspendLayout = true;

	if (!record.data.pgmap ||
	    !record.data.osdmap ||
	    !record.data.osdmap.osdmap ||
	    !record.data.health ||
	    !record.data.health.timechecks ||
	    !record.data.monmap ||
	    !record.data.monmap.mons) {
	    // only continue if we have all the data
	    return;
	}

	// update pgs sorted
	var pgs_by_state = record.data.pgmap.pgs_by_state || [];
	pgs_by_state.sort(function(a,b){
	    return (a.state_name < b.state_name)?-1:(a.state_name === b.state_name)?0:1;
	});
	me.getComponent('pgs').update({monitors: pgs_by_state});

	// update osds counts
	// caution: this code is not the nicest,
	// but since the status call only gives us
	// the total, up and in value,
	// we parse the health summary and look for the
	// x/y in osds are down message
	// to get the rest of the numbers
	//
	// the alternative would be to make a second api call,
	// as soon as not all osds are up, but those are costly

	var total_osds = record.data.osdmap.osdmap.num_osds || 0;
	var in_osds = record.data.osdmap.osdmap.num_in_osds || 0;
	var up_osds = record.data.osdmap.osdmap.num_up_osds || 0;
	var out_osds = total_osds - in_osds;
	var down_osds = total_osds - up_osds;
	var downin_osds = 0;
	var downinregex = /(\d+)\/(\d+) in osds are down/;
	Ext.Array.some(record.data.health.summary, function(item) {
	    var found = item.summary.match(downinregex);

	    if (found !== null) {
		// sanity check, test if the message is
		// consistent with the direct value
		// for in osds
		if (found[2] == in_osds) {
		    downin_osds = parseInt(found[1],10);
		    return true;
		}
	    }

	    return false;
	});

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
	var mons = record.data.monmap.mons.sort(function(a,b) {
	    return (a.name < b.name)?-1:(a.name > b.name)?1:0;
	});

	var monTimes = record.data.health.timechecks.mons || [];
	var timechecks = {};
	var monContainer = me.getComponent('monitors');
	var i;
	for (i = 0; i < mons.length && i < monTimes.length; i++) {
	       timechecks[monTimes[i].name] = monTimes[i].health;
	}

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
	    monitor.updateMonitor(timechecks[mons[i].name], mons[i], record.data.quorum_names);
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
    updateMonitor: function(timestate, data, quorum_names) {
	var me = this;
	var state = 'HEALTH_ERR';

	// if the monitor is part of the quorum
	// and has a timestate, get the timestate,
	// otherwise the state is ERR
	if (timestate && quorum_names &&
	    quorum_names.indexOf(data.name) !== -1) {
	    state = timestate;
	}

	me.update(Ext.apply(me.data, {
	    health: state,
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
			      gettext('Health')  + ': ' + me.data.health
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
		    me.tooltip.hide();
		}
	    }
	}
    }
});
