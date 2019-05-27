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
	itemId: 'osds',
	maxHeight: 250,
	scrollable: true,
	padding: '0 10 5 10',
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
	    '</div><br />',
	    '<tpl if="oldosds">',
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

    updateAll: function(metadata, status) {
	var me = this;
	me.suspendLayout = true;

	var maxversion = "00.0.00";
	Object.values(metadata.version || {}).forEach(function(version) {
	    if (version > maxversion) {
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
	var osdmap = status.osdmap || { osdmap: {} };


	// update pgs sorted
	var pgs_by_state = pgmap.pgs_by_state || [];
	pgs_by_state.sort(function(a,b){
	    return (a.state_name < b.state_name)?-1:(a.state_name === b.state_name)?0:1;
	});
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
	    downout: downout_osds,
	    oldosds: oldosds
	};
	var osdcomponent = me.getComponent('osds');
	osdcomponent.update(Ext.apply(osdcomponent.data, osds));

	me.suspendLayout = false;
	me.updateLayout();
    }
});

