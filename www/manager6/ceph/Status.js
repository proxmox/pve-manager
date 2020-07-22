Ext.define('PVE.node.CephStatus', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephStatus',

    onlineHelp: 'chapter_pveceph',

    scrollable: true,

    bodyPadding: 5,

    layout: {
	type: 'column'
    },

    defaults: {
	padding: 5
    },

    items: [
	{
	    xtype: 'panel',
	    title: gettext('Health'),
	    bodyPadding: 10,
	    plugins: 'responsive',
	    responsiveConfig: {
		'width < 1900': {
		    minHeight: 230,
		    columnWidth: 1
		},
		'width >= 1900': {
		    minHeight: 500,
		    columnWidth: 0.5
		}
	    },
	    layout: {
		type: 'hbox',
		align: 'stretch'
	    },
	    items: [
		{
		    xtype: 'container',
		    layout: {
			type: 'vbox',
			align: 'stretch',
		    },
		    flex: 1,
		    items: [
			{
			    flex: 1,
			    itemId: 'overallhealth',
			    xtype: 'pveHealthWidget',
			    title: gettext('Status')
			},
			{
			    itemId: 'versioninfo',
			    xtype: 'displayfield',
			    fieldLabel: gettext('Ceph Version'),
			    value: "",
			    autoEl: {
				tag: 'div',
				'data-qtip': gettext('The newest version installed in the Cluster.'),
			    },
			    padding: '10 0 0 0',
			    style: {
				'text-align': 'center',
			    },
			}
		    ],
		},
		{
		    flex: 2,
		    itemId: 'warnings',
		    stateful: true,
		    stateId: 'ceph-status-warnings',
		    xtype: 'grid',
		    // since we load the store manually to show the emptytext,
		    // we have to specify an empty one here
		    store: {
			trackRemoved: false,
			data: [],
		    },
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
						padding: 10,
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
	    plugins: 'responsive',
	    responsiveConfig: {
		'width < 1900': {
		    columnWidth: 1,
		    minHeight: 250
		},
		'width >= 1900': {
		    columnWidth: 0.5,
		    minHeight: 300
		}
	    },
	    title: gettext('Status')
	},
	{
	    title: gettext('Services'),
	    xtype: 'pveCephServices',
	    itemId: 'services',
	    plugins: 'responsive',
	    layout: {
		type: 'hbox',
		align: 'stretch'
	    },
	    responsiveConfig: {
		'width < 1900': {
		    columnWidth: 1,
		    minHeight: 200
		},
		'width >= 1900': {
		    columnWidth: 0.5,
		    minHeight: 200
		}
	    }
	},
	{
	    xtype: 'panel',
	    title: gettext('Performance'),
	    columnWidth: 1,
	    bodyPadding: 5,
	    layout: {
		type: 'hbox',
		align: 'center'
	    },
	    items: [
		{
		    flex: 1,
		    xtype: 'container',
		    items: [
			{
			    xtype: 'proxmoxGauge',
			    itemId: 'space',
			    title: gettext('Usage')
			},
			{
			    flex: 1,
			    border: false,
			},
			{
			    xtype: 'container',
			    itemId: 'recovery',
			    hidden: true,
			    padding: 25,
			    items: [
				{
				    itemId: 'recoverychart',
				    xtype: 'pveRunningChart',
				    title: gettext('Recovery') +'/ '+ gettext('Rebalance'),
				    renderer: PVE.Utils.render_bandwidth,
				    height: 100,
				},
				{
				    xtype: 'progressbar',
				    itemId: 'recoveryprogress',
				},
			    ]
			},
		    ]
		},
		{
		    flex: 2,
		    xtype: 'container',
		    defaults: {
			padding: 0,
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
			    itemId: 'readiops',
			    xtype: 'pveRunningChart',
			    title: 'IOPS: ' + gettext('Reads'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
			{
			    itemId: 'writeiops',
			    xtype: 'pveRunningChart',
			    title: 'IOPS: ' + gettext('Writes'),
			    renderer: Ext.util.Format.numberRenderer('0,000')
			},
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
	me.status = rec.data;

	// add health panel
	me.down('#overallhealth').updateHealth(PVE.Utils.render_ceph_health(rec.data.health || {}));
	// add errors to gridstore
	me.down('#warnings').getStore().loadRawData(me.generateCheckData(rec.data.health || {}), false);

	// update services
	me.getComponent('services').updateAll(me.metadata || {}, rec.data);

	// update detailstatus panel
	me.getComponent('statusdetail').updateAll(me.metadata || {}, rec.data);

	// add performance data
	let pgmap = rec.data.pgmap;
	let used = pgmap.bytes_used;
	let total = pgmap.bytes_total;

	var text = Ext.String.format(gettext('{0} of {1}'),
	    PVE.Utils.render_size(used),
	    PVE.Utils.render_size(total)
	);

	// update the usage widget
	me.down('#space').updateValue(used/total, text);

	let readiops = pgmap.read_op_per_sec;
	let writeiops = pgmap.write_op_per_sec;
	let reads = pgmap.read_bytes_sec || 0;
	let writes = pgmap.write_bytes_sec || 0;

	// update the graphs
	me.reads.addDataPoint(reads);
	me.writes.addDataPoint(writes);
	me.readiops.addDataPoint(readiops);
	me.writeiops.addDataPoint(writeiops);

	let degraded = pgmap.degraded_objects || 0;
	let misplaced = pgmap.misplaced_objects || 0;
	let unfound = pgmap.unfound_objects || 0;
	let unhealthy = degraded + unfound + misplaced;
	// update recovery
	if (pgmap.recovering_objects_per_sec !== undefined || unhealthy > 0) {
	    let total = pgmap.misplaced_total || pgmap.unfound_total || pgmap.degraded_total || 0;
	    if (total === 0) return;
	    let recovered = (total - unhealthy) || 0;
	    let speed = pgmap.recovering_bytes_per_sec || 0;
	    let speedTxt = PVE.Utils.render_bandwidth(speed);
	    let obj_per_sec = speed / (4*1024*1024); // 4MiB per Object
	    let duration = Proxmox.Utils.format_duration_human(unhealthy/obj_per_sec);

	    let percentage = recovered/total;
	    let txt = `${(percentage*100).toFixed(2)}%`;
	    if (speed > 0) {
		txt += ` (${speedTxt} - ${duration} left)`;
	    }

	    me.down('#recovery').setVisible(true);
	    me.down('#recoveryprogress').updateValue(percentage);
	    me.down('#recoveryprogress').updateText(txt);
	    me.down('#recoverychart').addDataPoint(speed);
	} else {
	    me.down('#recovery').setVisible(false);
	    me.down('#recoverychart').addDataPoint(0);
	}
    },

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;

	me.callParent();
	var baseurl = '/api2/json' + (nodename ? '/nodes/' + nodename : '/cluster') + '/ceph';
	me.store = Ext.create('Proxmox.data.UpdateStore', {
	    storeid: 'ceph-status-' + (nodename || 'cluster'),
	    interval: 5000,
	    proxy: {
		type: 'proxmox',
		url: baseurl + '/status'
	    }
	});

	me.metadatastore = Ext.create('Proxmox.data.UpdateStore', {
	    storeid: 'ceph-metadata-' + (nodename || 'cluster'),
	    interval: 15*1000,
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/cluster/ceph/metadata'
	    }
	});

	// save references for the updatefunction
	me.iops = me.down('#iops');
	me.readiops = me.down('#readiops');
	me.writeiops = me.down('#writeiops');
	me.reads = me.down('#reads');
	me.writes = me.down('#writes');

	var regex = new RegExp("not (installed|initialized)", "i");
	PVE.Utils.handleStoreErrorOrMask(me, me.store, regex, function(me, error){
	    me.store.stopUpdate();
	    PVE.Utils.showCephInstallOrMask(me, error.statusText, (nodename || 'localhost'),
		function(win){
		    me.mon(win, 'cephInstallWindowClosed', function(){
			me.store.startUpdate();
		    });
		}
	    );
	});

	me.mon(me.store, 'load', me.updateAll, me);
	me.mon(me.metadatastore, 'load', function(store, records, success) {
	    if (!success || records.length < 1) {
		return;
	    }
	    var rec = records[0];
	    me.metadata = rec.data;

	    // update services
	    me.getComponent('services').updateAll(rec.data, me.status || {});

	    // update detailstatus panel
	    me.getComponent('statusdetail').updateAll(rec.data, me.status || {});

	    let maxversion = [];
	    let maxversiontext = "";
	    for (const [nodename, data] of Object.entries(me.metadata.node)) {
		let version = data.version.parts;
		if (PVE.Utils.compare_ceph_versions(version, maxversion) > 0) {
		    maxversion = version;
		    maxversiontext = data.version.str;
		}
	    }
	    me.down('#versioninfo').setValue(maxversiontext);
	}, me);

	me.on('destroy', me.store.stopUpdate);
	me.on('destroy', me.metadatastore.stopUpdate);
	me.store.startUpdate();
	me.metadatastore.startUpdate();
    }

});
