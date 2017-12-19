Ext.define('PVE.lxc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.lxc.Config',

    onlineHelp: 'chapter_pct',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var template = me.pveSelNode.data.template;

	var running = !!me.pveSelNode.data.uptime;

	var caps = Ext.state.Manager.get('GuiCap');

	var base_url = '/nodes/' + nodename + '/lxc/' + vmid;

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: '/api2/json' + base_url + '/status/current',
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: base_url + "/status/" + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var startBtn = Ext.create('Ext.Button', {
	    text: gettext('Start'),
	    disabled: !caps.vms['VM.PowerMgmt'] || running,
	    handler: function() {
		vm_command('start');
	    },
	    iconCls: 'fa fa-play'
	});

	var stopBtn = Ext.create('Ext.menu.Item',{
	    text: gettext('Stop'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    confirmMsg: PVE.Utils.format_task_description('vzstop', vmid),
	    dangerous: true,
	    handler: function() {
		vm_command("stop");
	    },
	    iconCls: 'fa fa-stop'
	});

	var shutdownBtn = Ext.create('PVE.button.Split', {
	    text: gettext('Shutdown'),
	    disabled: !caps.vms['VM.PowerMgmt'] || !running,
	    confirmMsg: PVE.Utils.format_task_description('vzshutdown', vmid),
	    handler: function() {
		vm_command('shutdown');
	    },
	    menu: {
		items:[stopBtn]
	    },
	    iconCls: 'fa fa-power-off'
	});

	var migrateBtn = Ext.create('Ext.Button', {
	    text: gettext('Migrate'),
	    disabled: !caps.vms['VM.Migrate'],
	    hidden: PVE.data.ResourceStore.getNodes().length < 2,
	    handler: function() {
		var win = Ext.create('PVE.window.Migrate', {
		    vmtype: 'lxc',
		    nodename: nodename,
		    vmid: vmid
		});
		win.show();
	    },
	    iconCls: 'fa fa-send-o'
	});

	var moreBtn = Ext.create('PVE.button.Button', {
	    text: gettext('More'),
	    menu: { items: [
		{
		    iconCls: 'fa fa-heartbeat ',
		    hidden: !caps.nodes['Sys.Console'],
		    text: gettext('Manage HA'),
		    handler: function() {
			var ha = me.pveSelNode.data.hastate;
			Ext.create('PVE.ha.VMResourceEdit', {
			    vmid: vmid,
			    guestType: 'ct',
			    isCreate: (!ha || ha === 'unmanaged')
			}).show();
		    }
		},
		{
		    text: gettext('Remove'),
		    disabled: !caps.vms['VM.Allocate'],
		    itemId: 'removeBtn',
		    handler: function() {
			Ext.create('PVE.window.SafeDestroy', {
			    url: base_url,
			    item: { type: 'CT', id: vmid }
			}).show();
		    },
		    iconCls: 'fa fa-trash-o'
		}
	    ]}
	});

	var vm = me.pveSelNode.data;

	var consoleBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.vms['VM.Console'],
	    consoleType: 'lxc',
	    consoleName: vm.name,
	    nodename: nodename,
	    vmid: vmid
	});

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Container {0} on node '{1}'"), vm.text, nodename),
	    hstateid: 'lxctab',
	    tbar: [ startBtn, shutdownBtn, migrateBtn, consoleBtn, moreBtn ],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveLxcSummary',
		    iconCls: 'fa fa-book',
		    itemId: 'summary'
		}
	    ]
	});

	if (caps.vms['VM.Console']) {
	    me.items.push(
		{
		    title: gettext('Console'),
		    itemId: 'console',
		    iconCls: 'fa fa-terminal',
		    xtype: 'pveNoVncConsole',
		    vmid: vmid,
		    consoleType: 'lxc',
		    nodename: nodename
		},
		{
		    title: gettext('Console (JS)'),
		    itemId: 'consolejs',
		    iconCls: 'fa fa-terminal',
		    xtype: 'pveNoVncConsole',
		    vmid: vmid,
		    consoleType: 'lxc',
		    xtermjs: true,
		    nodename: nodename
		}
	    );
	}

	me.items.push(
	    {
		title: gettext('Resources'),
		itemId: 'resources',
		expandedOnInit: true,
		iconCls: 'fa fa-cube',
		xtype: 'pveLxcRessourceView'
	    },
	    {
		title: gettext('Network'),
		iconCls: 'fa fa-exchange',
		itemId: 'network',
		xtype: 'pveLxcNetworkView'
	    },
	    {
		title: gettext('DNS'),
		iconCls: 'fa fa-globe',
		itemId: 'dns',
		xtype: 'pveLxcDNS'
	    },
	    {
		title: gettext('Options'),
		itemId: 'options',
		iconCls: 'fa fa-gear',
		xtype: 'pveLxcOptions'
	    },
	    {
		title: gettext('Task History'),
		itemId: 'tasks',
		iconCls: 'fa fa-list',
		xtype: 'pveNodeTasks',
		vmidFilter: vmid
	    }
	);

	if (caps.vms['VM.Backup']) {
	    me.items.push({
		title: gettext('Backup'),
		iconCls: 'fa fa-floppy-o',
		xtype: 'pveBackupView',
		itemId: 'backup'
	    },
	    {
		title: gettext('Replication'),
		iconCls: 'fa fa-retweet',
		xtype: 'pveReplicaView',
		itemId: 'replication'
	    });
	}

	if (caps.vms['VM.Snapshot'] || caps.vms['VM.Snapshot.Rollback']) {
	    me.items.push({
		title: gettext('Snapshots'),
		iconCls: 'fa fa-history',
		xtype: 'pveLxcSnapshotTree',
		itemId: 'snapshot'
	    });
	}

	if (caps.vms['VM.Console']) {
	    me.items.push(
		{
		    xtype: 'pveFirewallRules',
		    title: gettext('Firewall'),
		    iconCls: 'fa fa-shield',
		    allow_iface: true,
		    base_url: base_url + '/firewall/rules',
		    list_refs_url: base_url + '/firewall/refs',
		    itemId: 'firewall'
		},
		{
		    xtype: 'pveFirewallOptions',
		    groups: ['firewall'],
		    iconCls: 'fa fa-gear',
		    onlineHelp: 'pve_firewall_vm_container_configuration',
		    title: gettext('Options'),
		    base_url: base_url + '/firewall/options',
		    fwtype: 'vm',
		    itemId: 'firewall-options'
		},
		{
		    xtype: 'pveFirewallAliases',
		    title: gettext('Alias'),
		    groups: ['firewall'],
		    iconCls: 'fa fa-external-link',
		    base_url: base_url + '/firewall/aliases',
		    itemId: 'firewall-aliases'
		},
		{
		    xtype: 'pveIPSet',
		    title: gettext('IPSet'),
		    groups: ['firewall'],
		    iconCls: 'fa fa-list-ol',
		    base_url: base_url + '/firewall/ipset',
		    list_refs_url: base_url + '/firewall/refs',
		    itemId: 'firewall-ipset'
		},
		{
		    title: gettext('Log'),
		    groups: ['firewall'],
		    iconCls: 'fa fa-list',
		    onlineHelp: 'chapter_pve_firewall',
		    itemId: 'firewall-fwlog',
		    xtype: 'pveLogView',
		    url: '/api2/extjs' + base_url + '/firewall/log'
		}
	    );
	}

	if (caps.vms['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		itemId: 'permissions',
		iconCls: 'fa fa-unlock',
		path: '/vms/' + vmid
	    });
	}

	me.callParent();

	me.mon(me.statusStore, 'load', function(s, records, success) {
	    var status;
	    if (!success) {
		status = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
		rec = s.data.get('template');
		template = rec.data.value || false;
	    }
	    startBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'running' || template);
	    shutdownBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running');
	    stopBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'stopped');
	    me.down('#removeBtn').setDisabled(!caps.vms['VM.Allocate'] || status !== 'stopped');
	    consoleBtn.setDisabled(template);
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
    }
});
