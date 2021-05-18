Ext.define('PVE.grid.TemplateSelector', {
    extend: 'Ext.grid.GridPanel',

    alias: 'widget.pveTemplateSelector',

    stateful: true,
    stateId: 'grid-template-selector',
    viewConfig: {
	trackOver: false,
    },
    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var baseurl = "/nodes/" + me.nodename + "/aplinfo";
	var store = new Ext.data.Store({
	    model: 'pve-aplinfo',
	    groupField: 'section',
	    proxy: {
                type: 'proxmox',
		url: '/api2/json' + baseurl,
	    },
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping', {
            groupHeaderTpl: '{[ "Section: " + values.name ]} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})',
	});

	var reload = function() {
	    store.load();
	};

	Proxmox.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		'->',
		gettext('Search'),
		{
		    xtype: 'textfield',
		    width: 200,
		    enableKeyEvents: true,
		    listeners: {
			buffer: 500,
			keyup: function(field) {
			    var value = field.getValue().toLowerCase();
			    store.clearFilter(true);
			    store.filterBy(function(rec) {
				return rec.data.package.toLowerCase().indexOf(value) !== -1 ||
				rec.data.headline.toLowerCase().indexOf(value) !== -1;
			    });
			},
		    },
		},
	    ],
	    features: [groupingFeature],
	    columns: [
		{
		    header: gettext('Type'),
		    width: 80,
		    dataIndex: 'type',
		},
		{
		    header: gettext('Package'),
		    flex: 1,
		    dataIndex: 'package',
		},
		{
		    header: gettext('Version'),
		    width: 80,
		    dataIndex: 'version',
		},
		{
		    header: gettext('Description'),
		    flex: 1.5,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'headline',
		},
	    ],
	    listeners: {
		afterRender: reload,
	    },
	});

	me.callParent();
    },

}, function() {
    Ext.define('pve-aplinfo', {
	extend: 'Ext.data.Model',
	fields: [
	    'template', 'type', 'package', 'version', 'headline', 'infopage',
	    'description', 'os', 'section',
	],
	idProperty: 'template',
    });
});

Ext.define('PVE.storage.TemplateDownload', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveTemplateDownload',

    modal: true,
    title: gettext('Templates'),
    layout: 'fit',
    width: 900,
    height: 600,
    initComponent: function() {
        var me = this;

	var grid = Ext.create('PVE.grid.TemplateSelector', {
	    border: false,
	    scrollable: true,
	    nodename: me.nodename,
	});

	var sm = grid.getSelectionModel();

	var submitBtn = Ext.create('Proxmox.button.Button', {
	    text: gettext('Download'),
	    disabled: true,
	    selModel: sm,
	    handler: function(button, event, rec) {
		Proxmox.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/aplinfo',
		    params: {
			storage: me.storage,
			template: rec.data.template,
		    },
		    method: 'POST',
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;

			Ext.create('Proxmox.window.TaskViewer', {
			    upid: upid,
			    listeners: {
				destroy: me.reloadGrid,
			    },
			}).show();

			me.close();
		    },
		});
	    },
	});

        Ext.apply(me, {
	    items: grid,
	    buttons: [submitBtn],
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.TemplateView', {
    extend: 'PVE.storage.ContentView',

    alias: 'widget.pveStorageTemplateView',

    initComponent: function() {
	var me = this;

	var nodename = me.nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storage = me.storage = me.pveSelNode.data.storage;
	if (!storage) {
	    throw "no storage ID specified";
	}

	me.content = 'vztmpl';

	var reload = function() {
	    me.store.load();
	};

	var templateButton = Ext.create('Proxmox.button.Button', {
	    itemId: 'tmpl-btn',
	    text: gettext('Templates'),
	    handler: function() {
		var win = Ext.create('PVE.storage.TemplateDownload', {
		    nodename: nodename,
		    storage: storage,
		    reloadGrid: reload,
		});
		win.show();
	    },
	});

	me.tbar = [templateButton];
	me.useUploadButton = true;

	me.callParent();
    },
});
