Ext.define('PVE.window.Settings', {
    extend: 'Ext.window.Window',

    width: '800px',
    title: gettext('My Settings'),
    iconCls: 'fa fa-gear',
    modal: true,
    bodyPadding: 10,
    resizable: false,

    buttons: [
	{
	    xtype: 'proxmoxHelpButton',
	    onlineHelp: 'gui_my_settings',
	    hidden: false
	},
	'->',
	{
	    text: gettext('Close'),
	    handler: function() {
		this.up('window').close();
	    }
	}
    ],

    layout: {
	type: 'column',
	align: 'top'
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	init: function(view) {
	    var me = this;
	    var sp = Ext.state.Manager.getProvider();

	    var username = sp.get('login-username') || Proxmox.Utils.noneText;
	    me.lookupReference('savedUserName').setValue(Ext.String.htmlEncode(username));
	    var vncMode = sp.get('novnc-scaling');
	    if (vncMode !== undefined) {
		me.lookupReference('noVNCScalingGroup').setValue({ noVNCScalingField: vncMode });
	    }

	    let summarycolumns = sp.get('summarycolumns', 'auto');
	    me.lookup('summarycolumns').setValue(summarycolumns);

	    me.lookup('guestNotesCollapse').setValue(sp.get('guest-notes-collapse', 'never'));

	    var settings = ['fontSize', 'fontFamily', 'letterSpacing', 'lineHeight'];
	    settings.forEach(function(setting) {
		var val = localStorage.getItem('pve-xterm-' + setting);
		if (val !== undefined && val !== null) {
		    var field = me.lookup(setting);
		    field.setValue(val);
		    field.resetOriginalValue();
		}
	    });
	},

	set_button_status: function() {
	    var me = this;

	    var form = me.lookup('xtermform');
	    var valid = form.isValid();
	    var dirty = form.isDirty();

	    var hasvalues = false;
	    var values = form.getValues();
	    Ext.Object.eachValue(values, function(value) {
		if (value) {
		    hasvalues = true;
		    return false;
		}
	    });

	    me.lookup('xtermsave').setDisabled(!dirty || !valid);
	    me.lookup('xtermreset').setDisabled(!hasvalues);
	},

	control: {
	    '#xtermjs form': {
		dirtychange: 'set_button_status',
		validitychange: 'set_button_status'
	    },
	    '#xtermjs button': {
		click: function(button) {
		    var me = this;
		    var settings = ['fontSize', 'fontFamily', 'letterSpacing', 'lineHeight'];
		    settings.forEach(function(setting) {
			var field = me.lookup(setting);
			if (button.reference === 'xtermsave') {
			    var value = field.getValue();
			    if (value) {
				localStorage.setItem('pve-xterm-' + setting, value);
			    } else {
				localStorage.removeItem('pve-xterm-' + setting);
			    }
			} else if (button.reference === 'xtermreset') {
			    field.setValue(undefined);
			    localStorage.removeItem('pve-xterm-' + setting);
			}
			field.resetOriginalValue();
		    });
		    me.set_button_status();
		}
	    },
	    'button[name=reset]': {
		click: function () {
		    var blacklist = ['GuiCap', 'login-username', 'dash-storages'];
		    var sp = Ext.state.Manager.getProvider();
		    var state;
		    for (state in sp.state) {
			if (sp.state.hasOwnProperty(state)) {
			    if (blacklist.indexOf(state) !== -1) {
				continue;
			    }

			    sp.clear(state);
			}
		    }

		    window.location.reload();
		}
	    },
	    'button[name=clear-username]': {
		click: function () {
		    var me = this;
		    var usernamefield = me.lookupReference('savedUserName');
		    var sp = Ext.state.Manager.getProvider();

		    usernamefield.setValue(Proxmox.Utils.noneText);
		    sp.clear('login-username');
		}
	    },
	    'grid[reference=dashboard-storages]': {
		selectionchange: function(grid, selected) {
		    var me = this;
		    var sp = Ext.state.Manager.getProvider();

		    // saves the selected storageids as
		    // "id1,id2,id3,..."
		    // or clears the variable
		    if (selected.length > 0) {
			sp.set('dash-storages',
			    Ext.Array.pluck(selected, 'id').join(','));
		    } else {
			sp.clear('dash-storages');
		    }
		},
		afterrender: function(grid) {
		    var me = grid;
		    var sp = Ext.state.Manager.getProvider();
		    var store = me.getStore();
		    var items = [];
		    me.suspendEvent('selectionchange');
		    var storages = sp.get('dash-storages') || '';
		    storages.split(',').forEach(function(storage){
			// we have to get the records
			// to be able to select them
			if (storage !== '') {
			    var item = store.getById(storage);
			    if (item) {
				items.push(item);
			    }
			}
		    });
		    me.getSelectionModel().select(items);
		    me.resumeEvent('selectionchange');
		}
	    },
	    'field[reference=summarycolumns]': {
		change: function(el, newValue) {
		    var sp = Ext.state.Manager.getProvider();
		    sp.set('summarycolumns', newValue);
		}
	    },
	    'field[reference=guestNotesCollapse]': {
		change: function(e, v) {
		    Ext.state.Manager.getProvider().set('guest-notes-collapse', v);
		},
	    },
	}
    },

    items: [{
	xtype: 'fieldset',
	columnWidth: 0.5,
	title: gettext('Webinterface Settings'),
	margin: '5',
	layout: {
	    type: 'vbox',
	    align: 'left'
	},
	defaults: {
	    width: '100%',
	    margin: '0 0 10 0'
	},
	items: [
	    {
		xtype: 'displayfield',
		fieldLabel: gettext('Dashboard Storages'),
		labelAlign: 'left',
		labelWidth: '50%'
	    },
	    {
		xtype: 'grid',
		maxHeight: 150,
		reference: 'dashboard-storages',
		selModel: {
		    selType: 'checkboxmodel'
		},
		columns: [{
		    header: gettext('Name'),
		    dataIndex: 'storage',
		    flex: 1
		},{
		    header: gettext('Node'),
		    dataIndex: 'node',
		    flex: 1
		}],
		store: {
		    type: 'diff',
		    field: ['type', 'storage', 'id', 'node'],
		    rstore: PVE.data.ResourceStore,
		    filters: [{
			property: 'type',
			value: 'storage'
		    }],
		    sorters: [ 'node','storage']
		}
	    },
	    {
		xtype: 'box',
		autoEl: { tag: 'hr'}
	    },
	    {
		xtype: 'container',
		layout:  'hbox',
		items: [
		    {
			xtype: 'displayfield',
			fieldLabel: gettext('Saved User Name') + ':',
			labelWidth: '150',
			stateId: 'login-username',
			reference: 'savedUserName',
			flex: 1,
			value: ''
		    },
		    {
			xtype: 'button',
			cls: 'x-btn-default-toolbar-small proxmox-inline-button',
			text: gettext('Reset'),
			name: 'clear-username',
		    },
		]
	    },
	    {
		xtype: 'box',
		autoEl: { tag: 'hr'}
	    },
	    {
		xtype: 'container',
		layout: 'hbox',
		items: [
		    {
			xtype: 'displayfield',
			fieldLabel: gettext('Layout') + ':',
			flex: 1,
		    },
		    {
			xtype: 'button',
			cls: 'x-btn-default-toolbar-small proxmox-inline-button',
			text: gettext('Reset'),
			tooltip: gettext('Reset all layout changes (for example, column widths)'),
			name: 'reset',
		    },
		]
	    },
	    {
		xtype: 'box',
		autoEl: { tag: 'hr'}
	    },
	    {
		xtype: 'proxmoxKVComboBox',
		fieldLabel: gettext('Summary columns') + ':',
		labelWidth: 150,
		stateId: 'summarycolumns',
		reference: 'summarycolumns',
		comboItems: [
		    ['auto', 'auto'],
		    ['1', '1'],
		    ['2', '2'],
		    ['3', '3'],
		],
	    },
	    {
		xtype: 'proxmoxKVComboBox',
		fieldLabel: gettext('Guest Notes') + ':',
		labelWidth: 150,
		stateId: 'guest-notes-collapse',
		reference: 'guestNotesCollapse',
		comboItems: [
		    ['never', 'Show by default'],
		    ['always', 'Collapse by default'],
		    ['auto', 'auto (Collapse if empty)'],
		],
	    },
	]
    },
    {
	xtype: 'container',
	layout: 'vbox',
	columnWidth: 0.5,
	margin: '5',
	defaults: {
	    width: '100%',
	    // right margin ensures that the right border of the fieldsets
	    // is shown
	    margin: '0 2 10 0'
	},
	items:[
	    {
		xtype: 'fieldset',
		itemId: 'xtermjs',
		title: gettext('xterm.js Settings'),
		items: [{
		    xtype: 'form',
		    reference: 'xtermform',
		    border: false,
		    layout: {
			type: 'vbox',
			algin: 'left'
		    },
		    defaults: {
			width: '100%',
			margin: '0 0 10 0',
		    },
		    items: [
			{
			    xtype: 'textfield',
			    name: 'fontFamily',
			    reference: 'fontFamily',
			    emptyText: Proxmox.Utils.defaultText,
			    fieldLabel: gettext('Font-Family')
			},
			{
			    xtype: 'proxmoxintegerfield',
			    emptyText: Proxmox.Utils.defaultText,
			    name: 'fontSize',
			    reference: 'fontSize',
			    minValue: 1,
			    fieldLabel: gettext('Font-Size')
			},
			{
			    xtype: 'numberfield',
			    name: 'letterSpacing',
			    reference: 'letterSpacing',
			    emptyText: Proxmox.Utils.defaultText,
			    fieldLabel: gettext('Letter Spacing')
			},
			{
			    xtype: 'numberfield',
			    name: 'lineHeight',
			    minValue: 0.1,
			    reference: 'lineHeight',
			    emptyText: Proxmox.Utils.defaultText,
			    fieldLabel: gettext('Line Height')
			},
			{
			    xtype: 'container',
			    layout: {
				type: 'hbox',
				pack: 'end'
			    },
			    defaults: {
				margin: '0 0 0 5',
			    },
			    items: [
				{
				    xtype: 'button',
				    reference: 'xtermreset',
				    disabled: true,
				    text: gettext('Reset')
				},
				{
				    xtype: 'button',
				    reference: 'xtermsave',
				    disabled: true,
				    text: gettext('Save')
				}
			    ]
			}
		    ]
		}]
	    },{
		xtype: 'fieldset',
		title: gettext('noVNC Settings'),
		items: [
		    {
			xtype: 'radiogroup',
			fieldLabel: gettext('Scaling mode'),
			reference: 'noVNCScalingGroup',
			height: '15px', // renders faster with value assigned
			layout: {
			    type: 'hbox',
			},
			items: [
			    {
				xtype: 'radiofield',
				name: 'noVNCScalingField',
				inputValue: 'scale',
				boxLabel: 'Local Scaling',
				checked: true,
			    },{
				xtype: 'radiofield',
				name: 'noVNCScalingField',
				inputValue: 'off',
				boxLabel: 'Off',
				margin: '0 0 0 10',
			    }
			],
			listeners: {
			    change: function(el, newValue, undefined) {
				var sp = Ext.state.Manager.getProvider();
				sp.set('novnc-scaling', newValue.noVNCScalingField);
			    }
			},
		    },
		]
	    },
	]
    }],
});
