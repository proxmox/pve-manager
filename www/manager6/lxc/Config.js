Ext.define('PVE.lxc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.lxc.Config',

    onlineHelp: 'chapter-pct.html',

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
	    disabled: !caps.vms['VM.PowerMgmt'],
	    handler: function() {
		vm_command('start');
	    },
	    iconCls: 'fa fa-play'
	});

	var umountBtn = Ext.create('Ext.Button', {
	    text: gettext('Unmount'),
	    disabled: true,
	    hidden: true,
	    handler: function() {
		vm_command('umount');
	    }
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
	    disabled: !caps.vms['VM.PowerMgmt'],
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

	var removeBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Remove'),
	    disabled: !caps.vms['VM.Allocate'],
	    handler: function() {
		Ext.create('PVE.window.SafeDestroy', {
		    url: base_url,
		    item: { type: 'CT', id: vmid }
		}).show();
	    },
	    iconCls: 'fa fa-trash-o'
	});

	var vmname = me.pveSelNode.data.name;

	var consoleBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.vms['VM.Console'],
	    consoleType: 'lxc',
	    consoleName: vmname,
	    nodename: nodename,
	    vmid: vmid,
	    iconCls: 'fa fa-terminal'
	});

	var descr = vmid + " (" + (vmname ? "'" + vmname + "' " : "'CT " + vmid + "'") + ")";

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Container {0} on node {1}"), descr, "'" + nodename + "'"),
	    hstateid: 'lxctab',
	    tbar: [ startBtn, shutdownBtn, umountBtn, removeBtn,
		    migrateBtn, consoleBtn ],
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
	    me.items.push({
		title: gettext('Console'),
		itemId: 'console',
		iconCls: 'fa fa-terminal',
		xtype: 'pveNoVncConsole',
		vmid: vmid,
		consoleType: 'lxc',
		nodename: nodename
	    });
	}

	me.items.push(
	    {
		title: gettext('Resources'),
		itemId: 'resources',
		onlineHelp: 'chapter-pct.html#_configuration',
		expandedOnInit: true,
		iconCls: 'fa fa-cube',
		xtype: 'pveLxcRessourceView'
	    },
	    {
		title: gettext('Network'),
		iconCls: 'fa fa-exchange',
		onlineHelp: 'chapter-pct.html#_container_network',
		itemId: 'network',
		xtype: 'pveLxcNetworkView'
	    },
	    {
		title: gettext('DNS'),
		iconCls: 'fa fa-globe',
		onlineHelp: 'chapter-pct.html#_container_network',
		itemId: 'dns',
		xtype: 'pveLxcDNS'
	    },
	    {
		title: gettext('Options'),
		itemId: 'options',
		onlineHelp: 'chapter-pct.html#_options',
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
		onlineHelp: 'chapter-vzdump.html',
		xtype: 'pveBackupView',
		itemId: 'backup'
	    });
	}

	if (caps.vms['VM.Snapshot']) {
	    me.items.push({
		title: gettext('Snapshots'),
		iconCls: 'fa fa-history',
		onlineHelp: 'chapter-pct.html#_snapshots',
		xtype: 'pveLxcSnapshotTree',
		itemId: 'snapshot'
	    });
	}

	if (caps.vms['VM.Console']) {
	    me.items.push(
		{
		    xtype: 'pveFirewallRules',
		    title: gettext('Firewall'),
		    onlineHelp: 'chapter-pve-firewall.html',
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
		    onlineHelp: 'chapter-pve-firewall.html#_vm_container_configuration',
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
		    onlineHelp: 'chapter-pve-firewall.html#_ip_aliases',
		    base_url: base_url + '/firewall/aliases',
		    itemId: 'firewall-aliases'
		},
		{
		    xtype: 'pveIPSet',
		    title: gettext('IPSet'),
		    groups: ['firewall'],
		    iconCls: 'fa fa-list-ol',
		    onlineHelp: 'chapter-pve-firewall.html#_ip_sets',
		    base_url: base_url + '/firewall/ipset',
		    list_refs_url: base_url + '/firewall/refs',
		    itemId: 'firewall-ipset'
		},
		{
		    title: gettext('Log'),
		    groups: ['firewall'],
		    iconCls: 'fa fa-list',
		    onlineHelp: 'chapter-pve-firewall.html',
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
		onlineHelp: 'chapter-pveum.html',
		path: '/vms/' + vmid
	    });
	}

	me.callParent();

	me.mon(me.statusStore, 'load', function(s, records, success) {
	    var status;
	    if (!success) {
		me.workspace.checkVmMigration(me.pveSelNode);
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
	    removeBtn.setDisabled(!caps.vms['VM.Allocate'] || status !== 'stopped');
	    consoleBtn.setDisabled(template);

	    if (status === 'mounted') {
		umountBtn.setDisabled(false);
		umountBtn.setVisible(true);
		stopBtn.setDisabled(true);
	    } else {
		umountBtn.setDisabled(true);
		umountBtn.setVisible(false);
		stopBtn.setDisabled(false);
	    }
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
    }
});
