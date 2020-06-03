Ext.define('PVE.ceph.StatusDetail', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveCephStatusDetail',

    layout: {
	type: 'hbox',
	align: 'stretch'
    },

    bodyPadding: '0 5',
    defaults: {
	xtype: 'box',
	style: {
	    'text-align':'center'
	}
    },

    items: [{
	flex: 1,
	itemId: 'osds',
	maxHeight: 250,
	scrollable: true,
	padding: '0 10 5 10',
	data: {
	    total: 0,
	    upin: 0,
	    upout: 0,
	    downin: 0,
	    downout: 0,
	    oldosds: []
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
	    '</div><br />',
	    '<tpl if="oldosds.length &gt; 0">',
	    '<i class="fa fa-refresh warning"></i> ' + gettext('Outdated OSDs') + "<br>",
	    '<div class="osds">',
	    '<tpl for="oldosds">',
	    '<div class="left-aligned">osd.{id}:</div>',
	    '<div class="right-aligned">{version}</div><br />',
	    '<div style="clear:both"></div>',
	    '</tpl>',
	    '</div>',
	    '</tpl>'
	]
    },
    {
	flex: 1,
	border: false,
	itemId: 'pgchart',
	xtype: 'polar',
	height: 184,
	innerPadding: 5,
	insetPadding: 5,
	colors: [
	    '#CFCFCF',
	    '#21BF4B',
	    '#FFCC00',
	    '#FF6C59'
	],
	store: { },
	series: [
	    {
		type: 'pie',
		donut: 60,
		angleField: 'count',
		tooltip: {
		    trackMouse: true,
		    renderer: function(tooltip, record, ctx) {
			var html = record.get('text');
			html += '<br>';
			record.get('states').forEach(function(state) {
			    html += '<br>' +
				state.state_name + ': ' + state.count.toString();
			});
			tooltip.setHtml(html);
		    }
		},
		subStyle: {
		    strokeStyle: false
		}
	    }
	]
    },
    {
	flex: 1.6,
	itemId: 'pgs',
	padding: '0 10',
	maxHeight: 250,
	scrollable: true,
	data: {
	    states: []
	},
	tpl: [
	    '<h3>' + 'PGs' + '</h3>',
	    '<tpl for="states">',
	    '<div class="left-aligned"><i class ="fa fa-circle {cls}"></i> {state_name}:</div>',
	    '<div class="right-aligned">{count}</div><br />',
	    '<div style="clear:both"></div>',
	    '</tpl>'
	]
    }],

    // similar to mgr dashboard
    pgstates: {
	// clean
	clean: 1,
	active: 1,

	// working
	activating: 2,
	backfill_wait: 2,
	backfilling: 2,
	creating: 2,
	deep: 2,
	degraded: 2,
	forced_backfill: 2,
	forced_recovery: 2,
	peered: 2,
	peering: 2,
	recovering: 2,
	recovery_wait: 2,
	repair: 2,
	scrubbing: 2,
	snaptrim: 2,
	snaptrim_wait: 2,

	// error
	backfill_toofull: 3,
	backfill_unfound: 3,
	down: 3,
	incomplete: 3,
	inconsistent: 3,
	recovery_toofull: 3,
	recovery_unfound: 3,
	remapped: 3,
	snaptrim_error: 3,
	stale: 3,
	undersized: 3
    },

    statecategories: [
	{
	    text: gettext('Unknown'),
	    count: 0,
	    states: [],
	    cls: 'faded'
	},
	{
	    text: gettext('Clean'),
	    cls: 'good'
	},
	{
	    text: gettext('Working'),
	    cls: 'warning'
	},
	{
	    text: gettext('Error'),
	    cls: 'critical'
	}
    ],

    updateAll: function(metadata, status) {
	var me = this;
	me.suspendLayout = true;

	var maxversion = "0";
	Object.values(metadata.version || {}).forEach(function(version) {
	    if (PVE.Utils.compare_ceph_versions(version, maxversion) > 0) {
		maxversion = version;
	    }
	});

	var oldosds = [];

	if (metadata.osd) {
	    metadata.osd.forEach(function(osd) {
		var version = PVE.Utils.parse_ceph_version(osd);
		if (version != maxversion) {
		    oldosds.push({
			id: osd.id,
			version: version
		    });
		}
	    });
	}

	var pgmap = status.pgmap || {};
	var health = status.health || {};
	var osdmap = status.osdmap || {};

	if (typeof osdmap.osdmap != "undefined") {
	    osdmap = osdmap.osdmap;
	}

	// update pgs sorted
	var pgs_by_state = pgmap.pgs_by_state || [];
	pgs_by_state.sort(function(a,b){
	    return (a.state_name < b.state_name)?-1:(a.state_name === b.state_name)?0:1;
	});

	me.statecategories.forEach(function(cat) {
	    cat.count = 0;
	    cat.states = [];
	});

	pgs_by_state.forEach(function(state) {
	    var i;
	    var states = state.state_name.split(/[^a-z]+/);
	    var result = 0;
	    for (i = 0; i < states.length; i++) {
		if (me.pgstates[states[i]] > result) {
		    result = me.pgstates[states[i]];
		}
	    }
	    // for the list
	    state.cls = me.statecategories[result].cls;

	    me.statecategories[result].count += state.count;
	    me.statecategories[result].states.push(state);
	});

	me.getComponent('pgchart').getStore().setData(me.statecategories);
	me.getComponent('pgs').update({states: pgs_by_state});

	var downinregex = /(\d+) osds down/;
	var downin_osds = 0;

	// we collect monitor/osd information from the checks
	Ext.Object.each(health.checks, function(key, value, obj) {
	    var found = null;
	    if (key === 'OSD_DOWN') {
		found = value.summary.message.match(downinregex);
		if (found !== null) {
		    downin_osds = parseInt(found[1],10);
		}
	    }
	});

	// update osds counts

	// pre-octopus || octopus || 0
	var total_osds = osdmap.num_osds || 0;
	var in_osds = osdmap.num_in_osds || 0;
	var up_osds = osdmap.num_up_osds || 0;
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
	    downout: downout_osds,
	    oldosds: oldosds
	};
	var osdcomponent = me.getComponent('osds');
	osdcomponent.update(Ext.apply(osdcomponent.data, osds));

	me.suspendLayout = false;
	me.updateLayout();
    }
});

