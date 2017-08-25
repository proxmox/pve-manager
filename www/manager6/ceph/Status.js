Ext.define('PVE.node.CephStatus', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephStatus',

    onlineHelp: 'chapter_pveceph',

    scrollable: true,

    bodyPadding: '10 0 0 0',

    defaults: {
	width: 762,
	userCls: 'inline-block',
	padding: '0 0 10 10'
    },

    items: [
	{
	    xtype: 'panel',
	    title: gettext('Health'),
	    bodyPadding: '0 10 10 10',
	    minHeight: 210,
	    layout: {
		type: 'hbox',
		align: 'top'
	    },
	    items: [
		{
		    flex: 1,
		    itemId: 'overallhealth',
		    xtype: 'pveHealthWidget',
		    title: gettext('Status')
		},
		{
		    flex: 2,
		    itemId: 'warnings',
		    stateful: true,
		    stateId: 'ceph-status-warnings',
		    padding: '15 0 0 0',
		    xtype: 'grid',
		    minHeight: 100,
		    // since we load the store manually,
		    // to show the emptytext, we have to
		    // specify an empty store
		    store: { data:[] },
		    emptyText: gettext('No Warnings/Errors'),
		    columns: [
			{
			    dataIndex: 'severity',
			    header: gettext('Severity'),
			    align: 'center',
			    width: 70,
			    renderer: function(value) {
				var health = PVE.Utils.map_ceph_health[value];
				var classes = PVE.Utils.get_health_icon(health);

				return '<i class="fa fa-fw ' + classes + '"></i>';
			    },
			    sorter: {
				sorterFn: function(a,b) {
				    var healthArr = ['HEALTH_ERR', 'HEALTH_WARN', 'HEALTH_OK'];
				    return healthArr.indexOf(b.data.severity) - healthArr.indexOf(a.data.severity);
				}
			    }
			},
			{
			    dataIndex: 'summary',
			    header: gettext('Summary'),
			    flex: 1
			},
			{
			    xtype: 'actioncolumn',
			    width: 40,
			    align: 'center',
			    tooltip: gettext('Detail'),
			    items: [
				{
				    iconCls: 'x-fa fa-info-circle',
				    handler: function(grid, rowindex, colindex, item, e, record) {
					var win = Ext.create('Ext.window.Window', {
					    title: gettext('Detail'),
					    resizable: true,
					    modal: true,
					    width: 650,
					    height: 400,
					    layout: {
						type: 'fit'
					    },
					    items: [{
						scrollable: true,
						padding: '10',
						xtype: 'box',
						html: [
						    '<span>' + Ext.htmlEncode(record.data.summary) + '</span>',
						    '<pre>' + Ext.htmlEncode(record.data.detail) + '</pre>'
						]
					    }]
					});
					win.show();
				    }
				}
			    ]
			}
		    ]
		}
	    ]
	},
	{
	    xtype: 'pveCephStatusDetail',
	    itemId: 'statusdetail',
	    title: gettext('Status')
	},
	{
	    xtype: 'panel',
	    title: gettext('Performance'),
	    bodyPadding: '0 10 10 10',
	    layout: {
		type: 'hbox',
		align: 'center'
	    },
	    items: [
		{
		    flex: 1,
		    xtype: 'pveGauge',
		    itemId: 'space',
		    title: gettext('Usage')
		},
		{
		    flex: 2,
		    xtype: 'container',
		    defaults: {
			padding: '0 0 0 30',
			height: 100
		    },
		    items: [
			{
			    itemId: 'reads',
			    xtype: 'pveRunningChart',
			    title: gettext('Reads'),
			    renderer: PVE.Utils.render_bandwidth
			},
			{
			    itemId: 'writes',
			    xtype: 'pveRunningChart',
			    title: gettext('Writes'),
			    renderer: PVE.Utils.render_bandwidth
			},
			{
			    itemId: 'iops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS', // do not localize
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
			{
			    itemId: 'readiops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS: ' + gettext('Reads'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
			{
			    itemId: 'writeiops',
			    xtype: 'pveRunningChart',
			    hidden: true,
			    title: 'IOPS: ' + gettext('Writes'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			}
		    ]
		}
	    ]
	}
    ],

    generateCheckData: function(health) {
	var result = [];
	var checks = health.checks || {};
	var keys = Ext.Object.getKeys(checks).sort();

	Ext.Array.forEach(keys, function(key) {
	    var details = checks[key].detail || [];
	    result.push({
		id: key,
		summary: checks[key].summary.message,
		detail: Ext.Array.reduce(
			    checks[key].detail,
			    function(first, second) {
				return first + '\n' + second.message;
			    },
			    ''
			),
		severity: checks[key].severity
	    });
	});

	return result;
    },

    updateAll: function(store, records, success) {
	if (!success || records.length === 0) {
	    return;
	}

	var me = this;
	var rec = records[0];

	// add health panel
	me.down('#overallhealth').updateHealth(PVE.Utils.render_ceph_health(rec.data.health || {}));
	// add errors to gridstore
	me.down('#warnings').getStore().loadRawData(me.generateCheckData(rec.data.health || {}), false);

	// update detailstatus panel
	me.getComponent('statusdetail').updateAll(
	    rec.data.health || {},
	    rec.data.monmap || {},
	    rec.data.pgmap || {},
	    rec.data.osdmap || {},
	    rec.data.quorum_names || []);

	// add performance data
	var used = rec.data.pgmap.bytes_used;
	var total = rec.data.pgmap.bytes_total;

	var text = Ext.String.format(gettext('{0} of {1}'),
	    PVE.Utils.render_size(used),
	    PVE.Utils.render_size(total)
	);

	// update the usage widget
	me.down('#space').updateValue(used/total, text);

	// TODO: logic for jewel (iops splitted in read/write)

	var iops = rec.data.pgmap.op_per_sec;
	var readiops = rec.data.pgmap.read_op_per_sec;
	var writeiops = rec.data.pgmap.write_op_per_sec;
	var reads = rec.data.pgmap.read_bytes_sec || 0;
	var writes = rec.data.pgmap.write_bytes_sec || 0;

	if (iops !== undefined && me.version !== 'hammer') {
	    me.change_version('hammer');
	} else if((readiops !== undefined || writeiops !== undefined) && me.version !== 'jewel') {
	    me.change_version('jewel');
	}
	// update the graphs
	me.reads.addDataPoint(reads);
	me.writes.addDataPoint(writes);
	me.iops.addDataPoint(iops);
	me.readiops.addDataPoint(readiops);
	me.writeiops.addDataPoint(writeiops);
    },

    change_version: function(version) {
	var me = this;
	me.version = version;
	me.sp.set('ceph-version', version);
	me.iops.setVisible(version === 'hammer');
	me.readiops.setVisible(version === 'jewel');
	me.writeiops.setVisible(version === 'jewel');
    },

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	me.callParent();
	me.store = Ext.create('PVE.data.UpdateStore', {
	    storeid: 'ceph-status-' + nodename,
	    interval: 5000,
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + nodename + '/ceph/status'
	    }
	});

	// save references for the updatefunction
	me.iops = me.down('#iops');
	me.readiops = me.down('#readiops');
	me.writeiops = me.down('#writeiops');
	me.reads = me.down('#reads');
	me.writes = me.down('#writes');

	// get ceph version
	me.sp = Ext.state.Manager.getProvider();
	me.version = me.sp.get('ceph-version');
	me.change_version(me.version);

	PVE.Utils.monStoreErrors(me,me.store);
	me.mon(me.store, 'load', me.updateAll, me);
	me.on('destroy', me.store.stopUpdate);
	me.store.startUpdate();
    }

});
