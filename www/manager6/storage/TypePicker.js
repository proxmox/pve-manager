// The storage types and setups of Datacenter > Storage > Add, grouped and searchable in one list
// that drops down from the Add button like the list of a combo box.
Ext.define('PVE.storage.TypePicker', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStorageTypePicker',

    floating: true,
    border: true,
    defaultFocus: 'textfield',
    ariaRole: 'dialog',
    ariaLabel: gettext('Add Storage'),

    // the storage view whose addActions() and addCategories list the entries
    storageView: undefined,
    // the button that the list drops down from
    button: undefined,

    loadActions: function () {
        let me = this;
        let categories = me.storageView.addCategories;
        let order = Object.fromEntries(categories.map((category, i) => [category.id, i]));
        me.actions = me.storageView.addActions();
        // one reason for all entries, such as a missing privilege, shows once above the list
        let reasons = new Set(me.actions.map((action) => action.disabledReason));
        me.sharedReason = reasons.size === 1 ? [...reasons][0] : undefined;
        let notice = me.down('#sharedReason');
        notice.setHtml(
            me.sharedReason
                ? `<i class="fa fa-fw fa-lock"></i> ${Ext.htmlEncode(me.sharedReason)}`
                : '',
        );
        notice.setHidden(!me.sharedReason);
        me.store.setData(
            me.actions.map((action, i) => {
                let group = order[action.category] ?? order.other;
                return {
                    ...action,
                    handler: undefined,
                    // the category is found by its name too
                    keywords: `${action.keywords} ${categories[group].text}`,
                    group,
                    order: i,
                };
            }),
        );
    },

    applyFilter: function (value) {
        let me = this;
        let words = (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) {
            me.store.clearFilter();
            return;
        }
        let text = (rec) =>
            [rec.get('text'), rec.get('description'), rec.get('keywords')].join(' ').toLowerCase();
        me.store.clearFilter(true);
        me.store.filterBy((rec) => words.every((word) => text(rec).includes(word)));
    },

    activate: function (rec) {
        let me = this;
        if (!rec || rec.get('disabledReason') || me.destroying || me.destroyed) {
            return;
        }
        let action = me.actions.find((entry) => entry.id === rec.get('id'));
        me.dismiss(true);
        action?.handler();
    },

    // Closes the list, with the focus back on the Add button, where a dialog returns it to.
    dismiss: function (refocus) {
        let me = this;
        if (me.destroying || me.destroyed) {
            return;
        }
        if (refocus && !me.button.destroyed) {
            me.button.focus();
        }
        me.destroy();
    },

    onDestroy: function () {
        let me = this;
        if (!me.button.destroyed) {
            me.button.removeCls(me.button._menuActiveCls);
            me.button.ariaEl?.dom.setAttribute('aria-expanded', 'false');
        }
        me.callParent();
    },

    // Shows the list below the button, as high as its entries need. It moves left where it is wider
    // than the space right of the button, and scrolls where it is higher than the space below.
    showBelow: function () {
        let me = this;
        let viewSize = Ext.getBody().getViewSize();
        let box = me.button.getBox();
        let y = box.bottom + 2;
        me.setMaxHeight(Math.max(200, viewSize.height - y - 10));
        me.showAt(Math.max(0, Math.min(box.x, viewSize.width - me.width - 10)), y);
        me.button.addCls(me.button._menuActiveCls);
        me.button.ariaEl?.dom.setAttribute('aria-expanded', 'true');
    },

    onFocusLeave: function (event) {
        let me = this;
        me.callParent(arguments);
        // the Add button closes the list itself
        if (event.toComponent !== me.button) {
            me.dismiss();
        }
    },

    initComponent: function () {
        let me = this;

        if (!me.storageView || !me.button) {
            throw 'no storage view or button given';
        }

        me.width = Math.min(760, Ext.getBody().getViewSize().width - 20);

        let categories = me.storageView.addCategories;
        me.store = Ext.create('Ext.data.Store', {
            autoDestroy: true,
            fields: [
                'id',
                'text',
                'description',
                'keywords',
                'iconCls',
                'disabledReason',
                { name: 'group', type: 'int' },
                { name: 'order', type: 'int' },
            ],
            groupField: 'group',
            sorters: ['order'],
        });

        let grid = Ext.create('Ext.grid.Panel', {
            store: me.store,
            hideHeaders: true,
            border: false,
            // grows with the entries, which needs all rows rendered
            bufferedRenderer: false,
            scrollable: 'y',
            features: [
                {
                    ftype: 'grouping',
                    collapsible: false,
                    enableGroupingMenu: false,
                    groupHeaderTpl: [
                        '{[this.header(values.groupValue)]}',
                        {
                            header: function (group) {
                                let { text, note } = categories[group];
                                return (
                                    Ext.htmlEncode(text) +
                                    (note
                                        ? ` <span style="font-weight: normal">- ${Ext.htmlEncode(note)}</span>`
                                        : '')
                                );
                            },
                        },
                    ],
                },
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: gettext('No storage type matches the search.'),
            },
            columns: [
                {
                    dataIndex: 'text',
                    width: 250,
                    cellWrap: true,
                    renderer: function (value, metaData, rec) {
                        metaData.tdStyle = rec.get('disabledReason')
                            ? 'opacity: 0.6'
                            : 'cursor: pointer';
                        let icon = rec.get('iconCls');
                        return `<i class="${icon}"></i> ${Ext.htmlEncode(value)}`;
                    },
                },
                {
                    dataIndex: 'description',
                    flex: 1,
                    cellWrap: true,
                    renderer: function (value, metaData, rec) {
                        let reason = rec.get('disabledReason');
                        if (!reason) {
                            metaData.tdStyle = 'cursor: pointer';
                            return Ext.htmlEncode(value);
                        }
                        metaData.tdStyle = 'opacity: 0.6';
                        if (me.sharedReason) {
                            return Ext.htmlEncode(value);
                        }
                        return (
                            (value ? `${Ext.htmlEncode(value)}<br>` : '') +
                            `<i class="fa fa-fw fa-lock"></i> ${Ext.htmlEncode(reason)}`
                        );
                    },
                },
            ],
            listeners: {
                itemclick: (view, rec) => me.activate(rec),
                itemkeydown: (view, rec, item, index, event) => {
                    if (event.getKey() === event.ENTER) {
                        event.stopEvent();
                        me.activate(rec);
                    } else if (event.getKey() === event.UP && index === 0) {
                        event.stopEvent();
                        me.down('textfield').focus();
                    }
                },
            },
        });

        let search = Ext.create('Ext.form.field.Text', {
            emptyText: gettext('Search'),
            enableKeyEvents: true,
            listeners: {
                change: {
                    buffer: 150,
                    fn: (field, value) => me.applyFilter(value),
                },
                specialkey: (field, event) => {
                    let key = event.getKey();
                    if (key !== event.DOWN && key !== event.ENTER) {
                        return;
                    }
                    event.stopEvent();
                    // the search may still be buffered
                    me.applyFilter(field.getValue());
                    if (key === event.DOWN && me.store.getCount()) {
                        grid.getView().focusRow(me.store.getAt(0));
                        grid.getSelectionModel().select(0);
                    } else if (key === event.ENTER) {
                        let enabled = me.store.getRange().filter((r) => !r.get('disabledReason'));
                        // an entry whose name has all words beats one found by its description
                        let words = field.getValue().toLowerCase().split(/\s+/).filter(Boolean);
                        let named = enabled.filter((r) =>
                            words.every((word) => r.get('text').toLowerCase().includes(word)),
                        );
                        let only =
                            enabled.length === 1 ? enabled[0] : named.length === 1 && named[0];
                        if (only) {
                            me.activate(only);
                        } else if (enabled.length) {
                            let first = named[0] ?? enabled[0];
                            grid.getView().focusRow(first);
                            grid.getSelectionModel().select(first);
                        }
                    }
                },
            },
        });

        me.layout = 'fit';
        me.items = [grid];
        me.dockedItems = [
            {
                // a toolbar has a background, unlike a plain container over the page
                xtype: 'toolbar',
                dock: 'top',
                layout: { type: 'vbox', align: 'stretch' },
                items: [search, { xtype: 'component', itemId: 'sharedReason', hidden: true }],
            },
        ];

        me.callParent();

        me.on('afterrender', () => {
            // Esc anywhere, as the focus can stay on the Add button after a press on it that did
            // not end in a click
            me.mon(Ext.getDoc(), 'keydown', (event) => {
                if (event.getKey() === event.ESC) {
                    event.stopEvent();
                    me.dismiss(true);
                }
            });
            // like the list of a combo box, a click elsewhere closes it, one on Add toggles it
            me.mon(Ext.getDoc(), 'mousedown', (event) => {
                let onButton = me.button.el?.contains(event.target);
                if (!me.owns(event.target) && (!onButton || event.button !== 0)) {
                    me.dismiss();
                }
            });
            me.mon(me.button, 'focusleave', (button, event) => {
                if (!me.el.contains(event.toElement)) {
                    me.dismiss();
                }
            });
        });
        me.mon(Ext.GlobalEvents, 'resize', () => me.dismiss());
        me.mon(me.storageView, {
            hide: () => me.dismiss(),
            deactivate: () => me.dismiss(),
            destroy: () => me.dismiss(),
        });

        me.loadActions();
        // custom plugins can arrive after the picker opened
        me.mon(me.storageView, 'addactionschange', () => {
            me.loadActions();
            me.applyFilter(search.getValue());
        });
    },
});
