/*jslint confusion: true*/
Ext.define('PVE.window.Migrate', {
    extend: 'Ext.window.Window',

    vmtype: undefined,
    nodename: undefined,
    vmid: undefined,

    viewModel: {
	data: {
	    vmid: undefined,
	    nodename: undefined,
	    vmtype: undefined,
	    running: false,
	    qemu: {
		onlineHelp: 'qm_migration',
		commonName: 'VM'
	    },
	    lxc: {
		onlineHelp: 'pct_migration',
		commonName: 'CT'
	    },
	    migration: {
		possible: true,
		preconditions: [],
		'with-local-disks': 0,
		mode: undefined,
		allowedNodes: undefined
	    }

	},

	formulas: {
	    setMigrationMode: function(get) {
		if (get('running')){
		    if (get('vmtype') === 'qemu') {
			return gettext('Online');
		    } else {
			return gettext('Restart Mode');
		    }
		} else {
		    return gettext('Offline');
		}
	    },
	    setStorageselectorHidden: function(get) {
		    if (get('migration.with-local-disks') && get('running')) {
			return false;
		    } else {
			return true;
		    }
	    }
	}
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'panel[reference=formPanel]': {
		validityChange: function(panel, isValid) {
		    this.getViewModel().set('migration.possible', isValid);
		    this.checkMigratePreconditions();
		}
	    }
	},

	init: function(view) {
	    var me = this,
		vm = view.getViewModel();

	    if (!view.nodename) {
		throw "missing custom view config: nodename";
	    }
	    vm.set('nodename', view.nodename);

	    if (!view.vmid) {
		throw "missing custom view config: vmid";
	    }
	    vm.set('vmid', view.vmid);

	    if (!view.vmtype) {
		throw "missing custom view config: vmtype";
	    }
	    vm.set('vmtype', view.vmtype);


	    view.setTitle(
		Ext.String.format('{0} {1}{2}', gettext('Migrate'), vm.get(view.vmtype).commonName, view.vmid)
	    );
	    me.lookup('proxmoxHelpButton').setHelpConfig({
		onlineHelp: vm.get(view.vmtype).onlineHelp
	    });
	    me.checkMigratePreconditions();
	    me.lookup('formPanel').isValid();

	},

	onTargetChange: function (nodeSelector) {
	    //Always display the storages of the currently seleceted migration target
	    this.lookup('pveDiskStorageSelector').setNodename(nodeSelector.value);
	    this.checkMigratePreconditions();
	},

	startMigration: function() {
	    var me = this,
		view = me.getView(),
		vm = me.getViewModel();

	    var values = me.lookup('formPanel').getValues();
	    var params = {
		target: values.target
	    };

	    if (vm.get('migration.mode')) {
		params[vm.get('migration.mode')] = 1;
	    }
	    if (vm.get('migration.with-local-disks')) {
		params['with-local-disks'] = 1;
	    }
	    //only submit targetstorage if vm is running, storage migration to different storage is only possible online
	    if (vm.get('migration.with-local-disks') && vm.get('running')) {
		params.targetstorage = values.targetstorage;
	    }

	    Proxmox.Utils.API2Request({
		params: params,
		url: '/nodes/' + vm.get('nodename') + '/' + vm.get('vmtype') + '/' + vm.get('vmid') + '/migrate',
		waitMsgTarget: view,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    var upid = response.result.data;
		    var extraTitle = Ext.String.format(' ({0} ---> {1})', vm.get('nodename'), params.target);

		    Ext.create('Proxmox.window.TaskViewer', {
			upid: upid,
			extraTitle: extraTitle
		    }).show();

		    view.close();
		}
	    });

	},

	checkMigratePreconditions: function() {
	    var me = this,
		vm = me.getViewModel();


	    var vmrec = PVE.data.ResourceStore.findRecord('vmid', vm.get('vmid'),
			0, false, false, true);
	    if (vmrec && vmrec.data && vmrec.data.running) {
		vm.set('running', true);
	    }

	    if (vm.get('vmtype') === 'qemu') {
		me.checkQemuPreconditions();
	    } else {
		me.checkLxcPreconditions();
	    }
	    me.lookup('pveNodeSelector').disallowedNodes = [vm.get('nodename')];

	    // Only allow nodes where the local storage is available in case of offline migration
	    // where storage migration is not possible
	    me.lookup('pveNodeSelector').allowedNodes = vm.get('migration.allowedNodes');

	    me.lookup('formPanel').isValid();

	},

	checkQemuPreconditions: function() {
	    var me = this,
		vm = me.getViewModel(),
		migrateStats;

	    if (vm.get('running')) {
		vm.set('migration.mode', 'online');
	    }

	    Proxmox.Utils.API2Request({
		url: '/nodes/' + vm.get('nodename') + '/' + vm.get('vmtype') + '/' + vm.get('vmid') + '/migrate',
		method: 'GET',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    migrateStats = response.result.data;
		    if (migrateStats.running) {
			vm.set('running', true);
		    }
		    // Get migration object from viewmodel to prevent
		    // to many bind callbacks
		    var migration = vm.get('migration');
		    migration.preconditions = [];

		    if (migrateStats.allowed_nodes) {
			migration.allowedNodes = migrateStats.allowed_nodes;

			if (!migrateStats.allowed_nodes.includes(me.lookup('pveNodeSelector').value)) {
			    migration.possible = false;
			    migration.preconditions.push({
				text: 'Local storage not available on selected Node, start VM to use live storage migration or select other target node',
				icon: '<i class="fa fa-times critical"></i>'
			    });
			}
		    }

		    if (migrateStats.local_resources.length) {
			migration.possible = false;
			migration.preconditions.push({
			    text: 'Can\'t migrate VM with local resources: '+ migrateStats.local_resources.join(', '),
			    icon: '<i class="fa fa-times critical"></i>'
			});
		    }

		    if (migrateStats.local_disks.length) {

			migrateStats.local_disks.forEach(function (disk) {
			    if (disk.cdrom && disk.cdrom === 1) {
				migration.possible = false;
				migration.preconditions.push({
				    text:'Can\'t migrate VM with local CD/DVD',
				    icon: '<i class="fa fa-times critical"></i>'
				});

			    } else if (!disk.referenced_in_config) {
				migration.possible = false;
				migration.preconditions.push({
				    text: 'Found not referenced/unused disk via storage: '+ disk.volid,
				    icon: '<i class="fa fa-times critical"></i>'
				});
			    } else {
				migration['with-local-disks'] = 1;
				migration.preconditions.push({
				    text:'Migration with local disk might take long: '+ disk.volid,
				    icon: '<i class="fa fa-exclamation-triangle warning"></i>'
				});
			    }
			});

		    }

		    vm.set('migration', migration);

		}
	    });
	},
	checkLxcPreconditions: function() {
	    var me = this,
		vm = me.getViewModel();
	    if (vm.get('running')) {
		vm.set('migration.mode', 'restart');
	    }
	}


    },

    width: 600,
    modal: true,
    layout: {
	type: 'vbox',
	align: 'stretch'
    },
    border: false,
    items: [
	{
	    xtype: 'form',
	    reference: 'formPanel',
	    bodyPadding: 10,
	    border: false,
	    layout: {
		type: 'column'
	    },
	    items: [
		{
		    xtype: 'container',
		    columnWidth: 0.5,
		    items: [{
			xtype: 'displayfield',
			name: 'source',
			fieldLabel: gettext('Source node'),
			bind: {
			    value: '{nodename}'
			}
		    },
		    {
			xtype: 'displayfield',
			reference: 'migrationMode',
			fieldLabel: gettext('Mode'),
			bind: {
			    value: '{setMigrationMode}'
			}
		    }]
		},
		{
		    xtype: 'container',
		    columnWidth: 0.5,
		    items: [{
			xtype: 'pveNodeSelector',
			reference: 'pveNodeSelector',
			name: 'target',
			fieldLabel: gettext('Target node'),
			allowBlank: false,
			disallowedNodes: undefined,
			onlineValidator: true,
			listeners: {
			    change: 'onTargetChange'
			}
		    },
		    {
			    xtype: 'pveStorageSelector',
			    reference: 'pveDiskStorageSelector',
			    name: 'targetstorage',
			    fieldLabel: gettext('Target storage'),
			    storageContent: 'images',
			    bind: {
				hidden: '{setStorageselectorHidden}'
			    }
		    }]
		}
	    ]
	},
	{
	    xtype: 'gridpanel',
	    reference: 'preconditionGrid',
	    flex: 1,
	    columns: [
		{text: 'Severity', dataIndex: 'icon', width: 80},
		{text: 'Info',  dataIndex: 'text', flex: 1}
	    ],
	    bind: {
		hidden: '{!migration.preconditions.length}',
		store: {
		    fields: ['icon','text'],
		    data: '{migration.preconditions}'
		}
	    }
	}

    ],
    buttons: [
	{
	    xtype: 'proxmoxHelpButton',
	    reference: 'proxmoxHelpButton',
	    onlineHelp: 'pct_migration',
	    listenToGlobalEvent: false,
	    hidden: false
	},
	'->',
	{
	    xtype: 'button',
	    reference: 'submitButton',
	    text: gettext('Migrate'),
	    handler: 'startMigration',
	    bind: {
		disabled: '{!migration.possible}'
	    }
	}
    ]
});
