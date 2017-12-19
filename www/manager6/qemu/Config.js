Ext.define('PVE.qemu.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.qemu.Config',

    onlineHelp: 'chapter_virtual_machines',

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

	var template = !!me.pveSelNode.data.template;

	var running = !!me.pveSelNode.data.uptime;

	var caps = Ext.state.Manager.get('GuiCap');

	var base_url = '/nodes/' + nodename + "/qemu/" + vmid;

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: '/api2/json' + base_url + '/status/current',
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: base_url + '/status/' + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var resumeBtn = Ext.create('Ext.Button', {
	    text: gettext('Resume'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    hidden: true,
	    handler: function() {
		vm_command('resume');
	    },
	    iconCls: 'fa fa-play'
	});

	var startBtn = Ext.create('Ext.Button', {
	    text: gettext('Start'),
	    disabled: !caps.vms['VM.PowerMgmt'] || running,
	    hidden: template,
	    handler: function() {
		vm_command('start');
	    },
	    iconCls: 'fa fa-play'
	});

	var migrateBtn = Ext.create('Ext.Button', {
	    text: gettext('Migrate'),
	    disabled: !caps.vms['VM.Migrate'],
	    hidden: PVE.data.ResourceStore.getNodes().length < 2,
	    handler: function() {
		var win = Ext.create('PVE.window.Migrate', {
		    vmtype: 'qemu',
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
		    text: gettext('Clone'),
		    iconCls: 'fa fa-fw fa-clone',
		    hidden: caps.vms['VM.Clone'] ? false : true,
		    handler: function() {
			PVE.window.Clone.wrap(nodename, vmid, template);
		    }
		},
		{
		    text: gettext('Convert to template'),
		    disabled: template,
		    xtype: 'pveMenuItem',
		    iconCls: 'fa fa-fw fa-file-o',
		    hidden: caps.vms['VM.Allocate'] ? false : true,
		    confirmMsg: PVE.Utils.format_task_description('qmtemplate', vmid),
		    handler: function() {
			PVE.Utils.API2Request({
			    url: base_url + '/template',
			    waitMsgTarget: me,
			    method: 'POST',
			    failure: function(response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
			    }
			});
		    }
		},
		{
		    iconCls: 'fa fa-heartbeat ',
		    hidden: !caps.nodes['Sys.Console'],
		    text: gettext('Manage HA'),
		    handler: function() {
			var ha = me.pveSelNode.data.hastate;
			Ext.create('PVE.ha.VMResourceEdit', {
			    vmid: vmid,
			    isCreate: (!ha || ha === 'unmanaged')
			}).show();
		    }
		},
		{
		    text: gettext('Remove'),
		    itemId: 'removeBtn',
		    disabled: !caps.vms['VM.Allocate'],
		    handler: function() {
			Ext.create('PVE.window.SafeDestroy', {
			    url: base_url,
			    item: { type: 'VM', id: vmid }
			}).show();
		    },
		    iconCls: 'fa fa-trash-o'
		}
	    ]}
	});

	var shutdownBtn = Ext.create('PVE.button.Split', {
	    text: gettext('Shutdown'),
	    disabled: !caps.vms['VM.PowerMgmt'] || !running,
	    hidden: template,
	    confirmMsg: PVE.Utils.format_task_description('qmshutdown', vmid),
	    handler: function() {
		vm_command('shutdown');
	    },
	    menu: {
		items: [{
		    text: gettext('Stop'),
		    disabled: !caps.vms['VM.PowerMgmt'],
		    dangerous: true,
		    confirmMsg: PVE.Utils.format_task_description('qmstop', vmid),
		    handler: function() {
			vm_command("stop", { timeout: 30 });
		    },
		    iconCls: 'fa fa-stop'
		},{
		    text: gettext('Reset'),
		    disabled: !caps.vms['VM.PowerMgmt'],
		    confirmMsg: PVE.Utils.format_task_description('qmreset', vmid),
		    handler: function() {
			vm_command("reset");
		    },
		    iconCls: 'fa fa-bolt'
		}]
	    },
	    iconCls: 'fa fa-power-off'
	});

	var vm = me.pveSelNode.data;

	var consoleBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.vms['VM.Console'],
	    hidden: template,
	    consoleType: 'kvm',
	    consoleName: vm.name,
	    nodename: nodename,
	    vmid: vmid
	});

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Virtual Machine {0} on node '{1}'"), vm.text, nodename),
	    hstateid: 'kvmtab',
	    tbar: [ resumeBtn, startBtn, shutdownBtn, migrateBtn, consoleBtn, moreBtn ],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveQemuSummary',
		    iconCls: 'fa fa-book',
		    itemId: 'summary'
		}
	    ]
	});

	if (caps.vms['VM.Console'] && !template) {
	    me.items.push({
		title: gettext('Console'),
		itemId: 'console',
		iconCls: 'fa fa-terminal',
		xtype: 'pveNoVncConsole',
		vmid: vmid,
		consoleType: 'kvm',
		nodename: nodename
	    });
	}

	me.items.push(
	    {
		title: gettext('Hardware'),
		itemId: 'hardware',
		iconCls: 'fa fa-desktop',
		xtype: 'PVE.qemu.HardwareView'
	    },
	    {
		title: gettext('Options'),
		iconCls: 'fa fa-gear',
		itemId: 'options',
		xtype: 'PVE.qemu.Options'
	    },
	    {
		title: gettext('Task History'),
		itemId: 'tasks',
		xtype: 'pveNodeTasks',
		iconCls: 'fa fa-list',
		vmidFilter: vmid
	    }
	);

	if (caps.vms['VM.Monitor'] && !template) {
	    me.items.push({
		title: gettext('Monitor'),
		iconCls: 'fa fa-eye',
		itemId: 'monitor',
		xtype: 'pveQemuMonitor'
	    });
	}

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

	if ((caps.vms['VM.Snapshot'] || caps.vms['VM.Snapshot.Rollback']) && !template) {
	    me.items.push({
		title: gettext('Snapshots'),
		iconCls: 'fa fa-history',
		xtype: 'pveQemuSnapshotTree',
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
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		path: '/vms/' + vmid
	    });
	}

	me.callParent();

        me.mon(me.statusStore, 'load', function(s, records, success) {
	    var status;
	    var qmpstatus;
	    var spice = false;

	    if (!success) {
		status = qmpstatus = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
		rec = s.data.get('qmpstatus');
		qmpstatus = rec ? rec.data.value : 'unknown';
		rec = s.data.get('template');
		template = rec.data.value || false;

		spice = s.data.get('spice') ? true : false;

	    }

	    if (template) {
		return;
	    }

	    if (qmpstatus === 'prelaunch' || qmpstatus === 'paused' || qmpstatus === 'suspended') {
		startBtn.setVisible(false);
		resumeBtn.setVisible(true);
	    } else {
		startBtn.setVisible(true);
		resumeBtn.setVisible(false);
	    }

	    consoleBtn.setEnableSpice(spice);

	    startBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'running' || template);
	    shutdownBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running');
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
